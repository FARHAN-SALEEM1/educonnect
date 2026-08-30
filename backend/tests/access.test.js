import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { accessBlock, hasTrialExpired } from "../src/utils/subscription.js";

/**
 * Access gating for self-service signups and free trials.
 *
 * Two production blockers lived here:
 *
 *  B1 — `accessBlock()` had no PENDING branch, so a signup that the schema and
 *       the signup comment both described as "awaiting approval" could log in
 *       and read and write immediately, on whatever plan it picked for itself.
 *
 *  B2 — `trialEndsAt` was written at signup and read nowhere, so no trial ever
 *       ended. Note that fixing `accessBlock` alone was not enough: the
 *       per-request check in middleware/auth.js selects an explicit column
 *       list, and `trialEndsAt` was missing from it, so the rule would have
 *       fired at login and gone silently dead on every later request.
 */

const MARK = "AccessSpec";
const PASSWORD = "AccessSpec!2026";
const created = [];
let sa, seeded = true;

const api = (t) => ({
  get: (u) => (t ? request(app).get(u).set("Authorization", `Bearer ${t}`) : request(app).get(u)),
  post: (u) => (t ? request(app).post(u).set("Authorization", `Bearer ${t}`) : request(app).post(u)),
  patch: (u) => (t ? request(app).patch(u).set("Authorization", `Bearer ${t}`) : request(app).patch(u)),
});

/** A fresh self-service signup. Returns { instituteId, email }. */
const signup = async (label) => {
  const n = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `${label}.admin.${n}@example.com`;
  const res = await request(app).post("/api/auth/signup").send({
    name: `${MARK} ${label} ${n}`,
    city: "Lahore",
    phone: "03001234567",
    email: `${label}.school.${n}@example.com`,
    planId: "elite",
    adminName: `${MARK} Admin`,
    adminEmail: email,
    adminPassword: PASSWORD,
  });
  expect(res.status, `signup failed: ${res.body?.message}`).toBe(201);
  const instituteId = res.body.data.institute.id;
  created.push(instituteId);
  return { instituteId, email, institute: res.body.data.institute };
};

const login = (email) =>
  request(app).post("/api/auth/login").send({ email, password: PASSWORD });

const approve = (id) =>
  api(sa).patch(`/api/institutes/${id}/status`).send({ status: "ACTIVE" });

beforeAll(async () => {
  const res = await request(app).post("/api/auth/login").send({
    email: "sa@educonnect.io", password: "super123",
  });
  if (res.status !== 200) { seeded = false; return; }
  sa = res.body.data.accessToken;
});

afterAll(async () => {
  if (!created.length) return;
  const kids = await prismaRaw.student.findMany({ where: { instituteId: { in: created } }, select: { id: true } });
  const ids = kids.map((k) => k.id);
  for (const m of ["attendance", "feeInvoice", "enrollment", "aIInsight"]) {
    if (prismaRaw[m]) { try { await prismaRaw[m].deleteMany({ where: { studentId: { in: ids } } }); } catch { /* not student-related */ } }
  }
  await prismaRaw.student.deleteMany({ where: { instituteId: { in: created } } });
  try { await prismaRaw.refreshToken.deleteMany({ where: { user: { instituteId: { in: created } } } }); } catch { /* ignore */ }
  await prismaRaw.user.deleteMany({ where: { instituteId: { in: created } } });
  await prismaRaw.subscriptionInvoice.deleteMany({ where: { instituteId: { in: created } } }).catch(() => {});
  await prismaRaw.institute.deleteMany({ where: { id: { in: created } } });
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

// ── B1 ────────────────────────────────────────────────────────────────
describe("B1 — an unapproved signup gets no access", () => {
  it("creates the institute in PENDING", async () => {
    if (skip()) return;
    const { institute } = await signup("pending");
    expect(institute.status).toBe("PENDING");
  });

  it("refuses login while PENDING, and says why", async () => {
    if (skip()) return;
    const { email } = await signup("nologin");
    const res = await login(email);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/awaiting approval/i);
  });

  it("grants no token to read or write with", async () => {
    if (skip()) return;
    const { email } = await signup("nowrite");
    const res = await login(email);
    expect(res.body.data?.accessToken).toBeUndefined();
  });

  it("cuts off an existing session if the institute returns to PENDING", async () => {
    if (skip()) return;
    const { email, instituteId } = await signup("revoke");
    expect((await approve(instituteId)).status).toBe(200);

    const token = (await login(email)).body.data.accessToken;
    expect((await api(token).get("/api/students?limit=1")).status).toBe(200);

    await prismaRaw.institute.update({ where: { id: instituteId }, data: { status: "PENDING" } });

    // The access token is still cryptographically valid; the per-request
    // institute check is what must stop it.
    const after = await api(token).get("/api/students?limit=1");
    expect(after.status).toBe(403);
    expect(after.body.message).toMatch(/awaiting approval/i);
  });
});

describe("B1 — super-admin activation still works", () => {
  it("lets an approved institute sign in and use the product", async () => {
    if (skip()) return;
    const { email, instituteId } = await signup("approved");

    expect((await login(email)).status).toBe(403);
    const activation = await approve(instituteId);
    expect(activation.status).toBe(200);

    const after = await login(email);
    expect(after.status).toBe(200);

    const token = after.body.data.accessToken;
    expect((await api(token).get("/api/students?limit=1")).status).toBe(200);
    const write = await api(token).post("/api/students").send({
      name: `${MARK} Student`, grade: "Grade 1", section: "A", rollNo: `AS-${Date.now()}`,
    });
    expect(write.status).toBe(201);
  });

  it("does not gate the super admin, who has no institute", async () => {
    if (skip()) return;
    expect((await api(sa).get("/api/institutes?limit=5")).status).toBe(200);
  });
});

// ── B2 ────────────────────────────────────────────────────────────────
describe("B2 — an expired trial stops granting access", () => {
  it("refuses login once the trial window has closed", async () => {
    if (skip()) return;
    const { email, instituteId } = await signup("expired");
    await approve(instituteId);
    expect((await login(email)).status).toBe(200);

    await prismaRaw.institute.update({
      where: { id: instituteId },
      data: { trialEndsAt: new Date(Date.now() - 60_000) },
    });

    const res = await login(email);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/free trial has ended/i);
  });

  it("cuts off a session already in flight", async () => {
    if (skip()) return;
    const { email, instituteId } = await signup("inflight");
    await approve(instituteId);
    const token = (await login(email)).body.data.accessToken;
    expect((await api(token).get("/api/students?limit=1")).status).toBe(200);

    await prismaRaw.institute.update({
      where: { id: instituteId },
      data: { trialEndsAt: new Date(Date.now() - 60_000) },
    });

    // Regression guard for the middleware column list: if `trialEndsAt` is
    // dropped from that select again, this is the test that fails.
    const after = await api(token).get("/api/students?limit=1");
    expect(after.status).toBe(403);
    expect(after.body.message).toMatch(/free trial has ended/i);
  });

  it("leaves a trial that is still running alone", async () => {
    if (skip()) return;
    const { email, instituteId } = await signup("running");
    await approve(instituteId);
    await prismaRaw.institute.update({
      where: { id: instituteId },
      data: { trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
    });
    expect((await login(email)).status).toBe(200);
  });

  it("never blocks an institute that is not on a trial", async () => {
    if (skip()) return;
    // The seeded schools carry no trialEndsAt and must be unaffected.
    const seededInstitutes = await prismaRaw.institute.findMany({
      where: { code: { in: ["INS001", "INS002", "INS003"] } },
      select: { trialEndsAt: true },
    });
    for (const i of seededInstitutes) expect(hasTrialExpired(i)).toBe(false);
    expect((await login("admin@bhs.edu")).status).toBe(401); // wrong password, not blocked
    const real = await request(app).post("/api/auth/login")
      .send({ email: "admin@bhs.edu", password: "admin123" });
    expect(real.status).toBe(200);
  });

  it("starts the trial at approval, not at signup", async () => {
    if (skip()) return;
    const { instituteId } = await signup("clock");

    // Simulate a signup that sat unapproved past its original window.
    await prismaRaw.institute.update({
      where: { id: instituteId },
      data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    await approve(instituteId);

    const after = await prismaRaw.institute.findUnique({
      where: { id: instituteId }, select: { trialEndsAt: true },
    });
    expect(after.trialEndsAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ── ordering ──────────────────────────────────────────────────────────
describe("accessBlock reports the most specific reason", () => {
  const past = new Date(Date.now() - 1000);

  it("prefers suspension and closure over trial state", () => {
    expect(accessBlock({ status: "SUSPENDED", trialEndsAt: past }).status).toBe("SUSPENDED");
    expect(accessBlock({ status: "CANCELLED", trialEndsAt: past }).status).toBe("CANCELLED");
  });

  it("calls an unapproved signup pending, not expired", () => {
    expect(accessBlock({ status: "PENDING", trialEndsAt: past }).status).toBe("PENDING");
  });

  it("allows an active institute with no trial set", () => {
    expect(accessBlock({ status: "ACTIVE", trialEndsAt: null })).toBeNull();
  });

  it("blocks an active institute whose trial has closed", () => {
    expect(accessBlock({ status: "ACTIVE", trialEndsAt: past }).status).toBe("TRIAL_EXPIRED");
  });
});
