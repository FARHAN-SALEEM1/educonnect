import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * The institute recycle bin.
 *
 * `DELETE /institutes/:id` is a soft delete and always was: the row keeps its
 * students, teachers, marks, attendance and invoices, gains a `deletedAt`, goes
 * CANCELLED, and its users are deactivated so nobody can sign in. The super
 * admin's confirmation dialog claimed the opposite — that it "erases every
 * student, teacher, parent, mark, attendance record and invoice" and "cannot be
 * undone" — which is a description of purge, not of delete. So the two are
 * pinned apart here: what delete leaves behind, and what purge actually takes.
 *
 * Every institute created here is a throwaway, erased in afterAll. Seeded
 * institutes are never touched.
 */

let sa, seeded = true;
const stamp = Date.now();
const made = [];

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});

/** A throwaway institute with one admin and one student inside it. */
const makeSchool = async (tag) => {
  const email = `bin.${tag}.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Bin School ${tag} ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `school.${tag}.${stamp}@test.edu`,
    planId: "starter",
    studentLimit: 25,
    adminName: "Bin Admin",
    adminEmail: email,
    adminPassword: "BinSpecPass123",
  });
  const id = signup.body.data?.institute?.id;
  if (!id) return null;
  made.push(id);

  await as(sa).patch(`/api/institutes/${id}/status`).send({ status: "ACTIVE" });
  const adminToken = await login(email, "BinSpecPass123");
  const student = await as(adminToken).post("/api/students").send({
    name: `Bin Student ${tag}`, grade: "Grade 5", section: "A", rollNo: `BIN-${tag}-${stamp}`,
  });
  return { id, adminToken, studentId: student.body.data?.id };
};

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) seeded = false;
});

afterAll(async () => {
  for (const id of made) {
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

describe("deleting an institute", () => {
  it("erases nothing — it only puts the school beyond reach", async () => {
    if (skip()) return;
    const school = await makeSchool("keep");
    if (!school) return;

    const before = {
      students: await prismaRaw.student.count({ where: { instituteId: school.id } }),
      users: await prismaRaw.user.count({ where: { instituteId: school.id } }),
    };
    expect(before.students).toBeGreaterThan(0);

    const res = await as(sa).delete(`/api/institutes/${school.id}`);
    expect(res.status).toBe(200);

    // the row and everything under it survive
    const row = await prismaRaw.institute.findUnique({ where: { id: school.id } });
    expect(row).not.toBeNull();
    expect(row.deletedAt).not.toBeNull();
    expect(row.status).toBe("CANCELLED");
    expect(await prismaRaw.student.count({ where: { instituteId: school.id } })).toBe(before.students);
    expect(await prismaRaw.user.count({ where: { instituteId: school.id } })).toBe(before.users);

    // but nobody there can get in
    expect(await prismaRaw.user.count({ where: { instituteId: school.id, isActive: true } })).toBe(0);
  });

  it("drops out of the live list and turns up in the bin", async () => {
    if (skip()) return;
    const school = await makeSchool("listed");
    if (!school) return;
    await as(sa).delete(`/api/institutes/${school.id}`);

    const live = await as(sa).get("/api/institutes?limit=200");
    expect(live.body.data.some((i) => i.id === school.id)).toBe(false);

    const bin = await as(sa).get("/api/institutes/deleted");
    expect(bin.status).toBe(200);
    const entry = bin.body.data.find((i) => i.id === school.id);
    expect(entry).toBeTruthy();
    // the bin states what is still being held, so the erase warning can be honest
    expect(entry.students).toBeGreaterThan(0);
    expect(entry.deletedAt).toBeTruthy();
  });

  it("comes back with its people able to sign in again", async () => {
    if (skip()) return;
    const school = await makeSchool("restore");
    if (!school) return;
    await as(sa).delete(`/api/institutes/${school.id}`);

    const res = await as(sa).post(`/api/institutes/${school.id}/restore`);
    expect(res.status).toBe(200);

    const row = await prismaRaw.institute.findUnique({ where: { id: school.id } });
    expect(row.deletedAt).toBeNull();
    expect(row.status).toBe("ACTIVE");
    expect(await prismaRaw.user.count({ where: { instituteId: school.id, isActive: true } })).toBeGreaterThan(0);
  });

  it("refuses to restore one that was never deleted", async () => {
    if (skip()) return;
    const school = await makeSchool("notdeleted");
    if (!school) return;
    const res = await as(sa).post(`/api/institutes/${school.id}/restore`);
    expect(res.status).toBe(400);
  });
});

describe("purging an institute", () => {
  it("will not touch one that is not in the bin", async () => {
    if (skip()) return;
    const school = await makeSchool("guard");
    if (!school) return;

    const res = await as(sa).delete(`/api/institutes/${school.id}/purge`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/recycle bin/i);
    expect(await prismaRaw.institute.findUnique({ where: { id: school.id } })).not.toBeNull();
  });

  it("really does erase, once the school is in the bin", async () => {
    if (skip()) return;
    const school = await makeSchool("purge");
    if (!school) return;
    await as(sa).delete(`/api/institutes/${school.id}`);

    const res = await as(sa).delete(`/api/institutes/${school.id}/purge`);
    expect(res.status).toBe(200);

    // this is the one operation that genuinely destroys
    expect(await prismaRaw.institute.findUnique({ where: { id: school.id } })).toBeNull();
    expect(await prismaRaw.student.count({ where: { instituteId: school.id } })).toBe(0);
    expect(await prismaRaw.user.count({ where: { instituteId: school.id } })).toBe(0);
  });

  it("is closed to an institute admin, and to a teacher", async () => {
    if (skip()) return;
    const school = await makeSchool("roles");
    if (!school) return;
    await as(sa).delete(`/api/institutes/${school.id}`);

    const bhsAdmin = await login("admin@bhs.edu", "admin123");
    const teacher = await login("hassan@bhs.edu", "teach123");

    for (const token of [bhsAdmin, teacher].filter(Boolean)) {
      expect((await as(token).get("/api/institutes/deleted")).status).toBe(403);
      expect((await as(token).post(`/api/institutes/${school.id}/restore`)).status).toBe(403);
      expect((await as(token).delete(`/api/institutes/${school.id}/purge`)).status).toBe(403);
    }

    // still there, still only the super admin's to decide about
    expect(await prismaRaw.institute.findUnique({ where: { id: school.id } })).not.toBeNull();
  });

  it("turns away an unauthenticated caller", async () => {
    if (skip()) return;
    expect((await request(app).get("/api/institutes/deleted")).status).toBe(401);
    expect((await request(app).delete("/api/institutes/anything/purge")).status).toBe(401);
  });
});

/**
 * The bin sends whole institute rows to a browser, and institute rows carry our
 * side of the payment gateway relationship.
 *
 * Every other institute response runs through `withoutProviderIds`. This one
 * did not — it had no caller, so nobody noticed, and giving the super admin a
 * recycle bin was exactly what would have put `providerCustomerId` and
 * `providerSubscriptionId` on the wire.
 */
describe("the bin does not carry gateway identifiers", () => {
  it("scrubs the provider ids off every row", async () => {
    if (skip()) return;
    const school = await makeSchool("scrub");
    if (!school) return;

    await prismaRaw.institute.update({
      where: { id: school.id },
      data: {
        providerCustomerId: "cus_parity_probe_value",
        providerSubscriptionId: "sub_parity_probe_value",
      },
    });
    await as(sa).delete(`/api/institutes/${school.id}`);

    const res = await as(sa).get("/api/institutes/deleted");
    expect(res.status).toBe(200);

    const row = res.body.data.find((i) => i.id === school.id);
    expect(row).toBeTruthy();
    expect(row).not.toHaveProperty("providerCustomerId");
    expect(row).not.toHaveProperty("providerSubscriptionId");

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("cus_parity_probe_value");
    expect(body).not.toContain("sub_parity_probe_value");

    // and it still tells the super admin what they came for
    expect(row.name).toContain("Bin School scrub");
    expect(row.students).toBeGreaterThan(0);
  });
});
