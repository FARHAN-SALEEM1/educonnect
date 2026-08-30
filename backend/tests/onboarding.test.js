import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Super Admin onboarding a school.
 *
 * The bug these were written for: `POST /api/institutes` created the institute
 * and its first subscription invoice and nothing else. No admin user, no
 * password, no email — while the button that calls it reads "Create & Send
 * Credentials". The school went live and there was no way into it, and nothing
 * on screen said so. A stray institute found in this database had exactly that
 * shape: zero users.
 *
 * So what is pinned here is not the mail — no SMTP is configured in this
 * environment and none is faked. It is that the account exists, that it can
 * actually sign in, that the institute and the admin cannot come apart, and
 * that when the mail does not go the response hands over the password instead
 * of dropping it.
 *
 * Throwaway schools, deleted in afterAll.
 */

let sa, seeded = true;
const created = [];
const stamp = Date.now();

const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

const onboard = (over = {}, label = "a") =>
  as(sa).post("/api/institutes").send({
    name: `Onboard School ${label} ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `onboard.${label}.${stamp}@test.edu`,
    planId: "growth",
    adminName: "Onboard Admin",
    adminEmail: `onboard.admin.${label}.${stamp}@test.edu`,
    ...over,
  });

const keep = (res) => {
  if (res.body?.data?.id) created.push(res.body.data.id);
  return res;
};

beforeAll(async () => {
  const res = await request(app).post("/api/auth/login").send({
    email: "sa@educonnect.io", password: "super123",
  });
  if (res.status !== 200) { seeded = false; return; }
  sa = res.body.data.accessToken;
});

afterAll(async () => {
  for (const id of created) {
    await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  }
  await prismaRaw.user.deleteMany({ where: { email: { contains: `.${stamp}@test.edu` } } }).catch(() => {});
});

const skip = () => !seeded;

/**
 * The setup ran.
 *
 * Every test below opens with `if (skip()) return`, which lets this file stand
 * down on an unseeded machine — and which also turns a broken `beforeAll` into
 * a column of green ticks. This is the one check that does not skip when the
 * seed is actually there. See tests/helpers/fixtures.js for what it cost.
 */
it("built its fixtures", async () => {
  const { seedPresent } = await import("./helpers/fixtures.js");
  if (!(await seedPresent())) return;
  expect(seeded, "beforeAll did not complete — every test in this file is vacuous").toBe(
    true
  );
});

describe("onboarding a school", () => {
  it("creates an admin who can actually sign in", async () => {
    if (skip()) return;
    const res = keep(await onboard({}, "signin"));
    expect(res.status).toBe(201);

    const email = `onboard.admin.signin.${stamp}@test.edu`;
    // No mail server here, so the response is where the password has to be.
    const password = (res.body.message.match(/temporary password: (\S+?)[\s)]/i) ?? [])[1];
    expect(password, `no password in: ${res.body.message}`).toBeTruthy();

    const login = await request(app).post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("ADMIN");
    expect(login.body.data.user.instituteId ?? login.body.data.user.institute?.id)
      .toBe(res.body.data.id);
  });

  it("says who the admin is and how to reach them", async () => {
    if (skip()) return;
    const res = keep(await onboard({}, "msg"));
    expect(res.body.data.adminEmail).toBe(`onboard.admin.msg.${stamp}@test.edu`);
    expect(res.body.data).toHaveProperty("emailed");
    expect(res.body.message).toContain(`onboard.admin.msg.${stamp}@test.edu`);
  });

  it("honours a password the platform owner sets, and does not print it back", async () => {
    if (skip()) return;
    const res = keep(await onboard({ adminPassword: "OwnerChosen123" }, "chosen"));
    expect(res.status).toBe(201);
    expect(res.body.message).not.toContain("OwnerChosen123");
    expect(res.body.data.emailed).toBe(false);

    const login = await request(app).post("/api/auth/login").send({
      email: `onboard.admin.chosen.${stamp}@test.edu`, password: "OwnerChosen123",
    });
    expect(login.status).toBe(200);
  });

  it("refuses a school with no admin, rather than making one nobody can enter", async () => {
    if (skip()) return;
    const res = await as(sa).post("/api/institutes").send({
      name: `Adminless ${stamp}`, city: "Lahore", phone: "03001234567",
      email: `adminless.${stamp}@test.edu`, planId: "starter",
    });
    expect(res.status).toBe(422);
    expect(await prismaRaw.institute.count({ where: { name: `Adminless ${stamp}` } })).toBe(0);
  });

  it("refuses an admin email that already belongs to somebody", async () => {
    if (skip()) return;
    keep(await onboard({}, "first"));

    const res = await onboard({
      adminEmail: `onboard.admin.first.${stamp}@test.edu`,
      email: `onboard.dup.${stamp}@test.edu`,
    }, "dup");

    expect(res.status).toBe(409);
    expect(await prismaRaw.institute.count({ where: { name: `Onboard School dup ${stamp}` } })).toBe(0);
  });

  /**
   * The institute, its admin and its first invoice are one transaction. An
   * unknown plan is rejected before any of it, so a half-built school cannot
   * be left behind.
   */
  it("writes the school, its admin and its first invoice together or not at all", async () => {
    if (skip()) return;
    const res = keep(await onboard({}, "txn"));
    const id = res.body.data.id;

    const [users, invoices] = await Promise.all([
      prismaRaw.user.findMany({ where: { instituteId: id }, select: { role: true, email: true } }),
      prismaRaw.subscriptionInvoice.count({ where: { instituteId: id } }),
    ]);
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("ADMIN");
    expect(invoices).toBe(1);

    const bad = await onboard({ planId: "platinum", email: `bad.${stamp}@test.edu` }, "bad");
    expect(bad.status).toBe(422);
    expect(await prismaRaw.user.count({ where: { email: `onboard.admin.bad.${stamp}@test.edu` } })).toBe(0);
  });

  it("goes live immediately, unlike a self-service signup", async () => {
    if (skip()) return;
    const res = keep(await onboard({}, "live"));
    expect(res.body.data.status).toBe("ACTIVE");
  });

  it("stays superadmin-only", async () => {
    if (skip()) return;
    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@bhs.edu", password: "admin123",
    });
    if (admin.status !== 200) return;

    const res = await as(admin.body.data.accessToken).post("/api/institutes").send({
      name: `Sneaky ${stamp}`, city: "Lahore", phone: "03001234567",
      email: `sneaky.${stamp}@test.edu`, planId: "starter",
      adminName: "Sneaky", adminEmail: `sneaky.admin.${stamp}@test.edu`,
    });
    expect(res.status).toBe(403);
    expect(await prismaRaw.institute.count({ where: { name: `Sneaky ${stamp}` } })).toBe(0);
  });

  it("leaves the admin account alone when the school is edited", async () => {
    if (skip()) return;
    const res = keep(await onboard({}, "edit"));
    const id = res.body.data.id;

    const patch = await as(sa).patch(`/api/institutes/${id}`).send({
      city: "Karachi",
      adminEmail: "hijack@test.edu",
      adminName: "Hijack",
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data.city).toBe("Karachi");

    const users = await prismaRaw.user.findMany({ where: { instituteId: id }, select: { email: true } });
    expect(users.map((u) => u.email)).toEqual([`onboard.admin.edit.${stamp}@test.edu`]);
  });
});
