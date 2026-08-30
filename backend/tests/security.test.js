import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

/**
 * Practical security checks: cross-tenant object access (IDOR), privilege
 * escalation, and hostile input. Read-only apart from one notice that is
 * created and deleted within a single test.
 */

let bhsAdmin, lacasAdmin, teacher, parent, seeded = true;
let bhsStudent, bhsNotice, bhsTeacher;

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

beforeAll(async () => {
  [bhsAdmin, lacasAdmin, teacher, parent] = await Promise.all([
    login("admin@bhs.edu", "admin123"),
    login("admin@lacas.edu", "admin123"),
    login("hassan@bhs.edu", "teach123"),
    login("sara@gmail.com", "parent123"),
  ]);
  if (!bhsAdmin || !lacasAdmin) { seeded = false; return; }

  bhsStudent = await prisma.student.findFirst({ where: { institute: { name: "Beaconhouse School" } } });
  bhsNotice = await prisma.notice.findFirst({ where: { institute: { name: "Beaconhouse School" } } });
  bhsTeacher = await prisma.teacher.findFirst({ where: { institute: { name: "Beaconhouse School" } } });
  if (!bhsStudent || !bhsNotice || !bhsTeacher) seeded = false;
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

describe("IDOR — another institute's IDs must not work", () => {
  it("refuses cross-tenant reads, updates and deletes", async () => {
    if (skip()) return;
    const attempts = [
      as(lacasAdmin).get(`/api/students/${bhsStudent.id}`),
      as(lacasAdmin).patch(`/api/students/${bhsStudent.id}`).send({ name: "Hijacked" }),
      as(lacasAdmin).delete(`/api/students/${bhsStudent.id}`),
      as(lacasAdmin).patch(`/api/notices/${bhsNotice.id}`).send({ title: "Hijacked" }),
      as(lacasAdmin).delete(`/api/notices/${bhsNotice.id}`),
      as(lacasAdmin).patch(`/api/teachers/${bhsTeacher.id}`).send({ name: "Hijacked" }),
    ];
    for (const res of await Promise.all(attempts)) {
      // 404, not 403 — a 403 would confirm the id exists.
      expect(res.status).toBe(404);
    }
  });

  it("leaves the targeted records untouched", async () => {
    if (skip()) return;
    const after = await prisma.student.findUnique({ where: { id: bhsStudent.id } });
    expect(after.name).toBe(bhsStudent.name);
    expect(after.deletedAt).toBeNull();
  });

  it("stops a parent reading a child that isn't theirs", async () => {
    if (skip()) return;
    const other = await prisma.student.findFirst({
      where: { institute: { name: "Beaconhouse School" }, parent: { email: { not: "sara@gmail.com" } } },
    });
    if (!other) return;
    expect((await as(parent).get(`/api/students/${other.id}`)).status).toBe(404);
  });
});

describe("privilege escalation", () => {
  it("stops an admin promoting themselves to super admin", async () => {
    if (skip()) return;
    const me = (await as(bhsAdmin).get("/api/auth/me")).body.data;
    expect((await as(bhsAdmin).patch(`/api/users/${me.id}`).send({ role: "SUPERADMIN" })).status).toBe(403);

    const row = await prisma.user.findUnique({ where: { id: me.id } });
    expect(row.role).toBe("ADMIN");
  });

  it("stops a teacher performing admin-only writes", async () => {
    if (skip()) return;
    expect((await as(teacher).delete(`/api/students/${bhsStudent.id}`)).status).toBe(403);
    expect((await as(teacher).post("/api/students").send({ name: "X", grade: "G", section: "A", rollNo: "X" })).status).toBe(403);
  });

  it("stops an institute admin reaching platform-owner endpoints", async () => {
    if (skip()) return;
    expect((await as(bhsAdmin).get("/api/platform/settings")).status).toBe(403);
    expect((await as(bhsAdmin).get("/api/institutes/deleted")).status).toBe(403);
    expect((await as(bhsAdmin).post("/api/notices/broadcast").send({ title: "x", body: "y" })).status).toBe(403);
  });
});

describe("hostile input", () => {
  it("stores an XSS payload as inert text and never as markup", async () => {
    if (skip()) return;
    const xss = "<script>alert(1)</script>";
    const made = await as(bhsAdmin).post("/api/notices").send({
      title: xss, body: `<img src=x onerror=alert(1)>`, category: "GENERAL",
    });
    expect(made.status).toBe(201);

    const row = await prisma.notice.findUnique({ where: { id: made.body.data.id } });
    // Stored verbatim; React escapes on render, so it is never executed.
    expect(row.title).toBe(xss);

    await as(bhsAdmin).delete(`/api/notices/${made.body.data.id}`);
  });

  it("treats SQL payloads as ordinary search text", async () => {
    if (skip()) return;
    const before = await prisma.student.count();
    const res = await as(bhsAdmin).get(`/api/students?search=${encodeURIComponent("'; DROP TABLE students; --")}`);
    expect(res.status).toBe(200);
    expect(await prisma.student.count()).toBe(before);
  });

  it("rejects oversized, wrong-typed and malformed bodies", async () => {
    if (skip()) return;
    expect((await as(bhsAdmin).post("/api/notices").send({ title: "A".repeat(50000), body: "x" })).status).toBe(422);
    expect((await as(bhsAdmin).post("/api/students").send({ name: 12345, grade: {}, section: [], rollNo: null })).status).toBe(422);
    expect((await as(bhsAdmin).post("/api/students").send({})).status).toBe(422);
    expect((await as(bhsAdmin).post("/api/students").send([1, 2, 3])).status).toBe(422);
  });

  it("rejects unauthenticated and malformed tokens", async () => {
    expect((await request(app).get("/api/students")).status).toBe(401);
    expect((await request(app).get("/api/students").set("Authorization", "Bearer garbage")).status).toBe(401);
    expect((await request(app).get("/api/students").set("Authorization", "NotEvenBearer")).status).toBe(401);
  });

  it("returns 404 for an id that cannot exist", async () => {
    if (skip()) return;
    expect((await as(bhsAdmin).get("/api/students/not-a-real-id")).status).toBe(404);
  });
});

/**
 * Nothing that identifies us to the payment gateway may reach a browser, and
 * least of all an anonymous one.
 *
 * `GET /api/plans` needs no token — it draws the pricing table on the landing
 * page — and it was returning every Plan column, `providerPriceIds` included.
 * PLAN_PUBLIC existed and was used at every site where a plan is nested inside
 * something else; the one endpoint that returns plans on their own was the one
 * that missed it, which is the easiest kind of gap to leave behind.
 */
describe("public responses carry nothing from the server's side of the gateway", () => {
  const FORBIDDEN = [
    "providerPriceIds",
    "providerCustomerId",
    "providerSubscriptionId",
    "passwordHash",
    "webhookSecret",
    "SAFEPAY",
    "SMTP_PASS",
    "JWT_",
  ];

  it("serves the pricing table without a token, and without price ids", async () => {
    const res = await request(app).get("/api/plans");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const plan of res.body.data) {
      expect(plan).not.toHaveProperty("providerPriceIds");
      // and it is still the plan the pricing table needs
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("price");
      expect(plan).toHaveProperty("maxStudents");
    }

    const body = JSON.stringify(res.body);
    for (const key of FORBIDDEN) expect(body).not.toContain(key);
  });

  it("keeps the same promise on the endpoints an admin sees", async () => {
    if (skip()) return;
    const urls = [
      "/api/institutes/me",
      "/api/institutes/me/subscription",
      "/api/billing/status",
      "/api/auth/me",
    ];
    for (const url of urls) {
      const res = await as(bhsAdmin).get(url);
      if (res.status !== 200) continue;
      const body = JSON.stringify(res.body);
      for (const key of FORBIDDEN) {
        expect(body, `${url} leaked ${key}`).not.toContain(key);
      }
    }
  });
});
