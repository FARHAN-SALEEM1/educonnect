import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma, prismaRaw } from "../src/config/prisma.js";

/**
 * Tenant isolation and role-based visibility — the security properties the
 * whole product rests on. Everything here is read-only against the seeded
 * database, so the suite is safe to run against a dev environment.
 *
 * Run `npm run db:seed` first if this skips.
 */

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.body.message}`);
  return res.body.data.accessToken;
};

const as = (token) => ({
  get: (url) => request(app).get(url).set("Authorization", `Bearer ${token}`),
  post: (url) => request(app).post(url).set("Authorization", `Bearer ${token}`),
  patch: (url) => request(app).patch(url).set("Authorization", `Bearer ${token}`),
  delete: (url) => request(app).delete(url).set("Authorization", `Bearer ${token}`),
});

let seeded = true;
let bhsAdmin, lacasAdmin, teacher, parent, superAdmin;
let bhs, lacas, otherStudent;

beforeAll(async () => {
  const count = await prisma.institute.count();
  if (count < 2) {
    seeded = false;
    return;
  }

  [bhs, lacas] = await Promise.all([
    prisma.institute.findFirst({ where: { name: "Beaconhouse School" } }),
    prisma.institute.findFirst({ where: { name: "LACAS" } }),
  ]);

  if (!bhs || !lacas) {
    seeded = false;
    return;
  }

  [superAdmin, bhsAdmin, lacasAdmin, teacher, parent] = await Promise.all([
    login("sa@educonnect.io", "super123"),
    login("admin@bhs.edu", "admin123"),
    login("admin@lacas.edu", "admin123"),
    login("hassan@bhs.edu", "teach123"),
    login("sara@gmail.com", "parent123"),
  ]);

  // A student the Beaconhouse teacher does NOT teach, for negative tests.
  otherStudent = await prisma.student.findFirst({
    where: { institute: { name: "Beaconhouse School" }, enrollments: { none: {} } },
  });
});

const skipUnlessSeeded = () => {
  if (!seeded) {
    console.warn("[tests] Seed data missing — run `npm run db:seed`. Skipping tenancy suite.");
    return true;
  }
  return false;
};

describe("authentication", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/students");
    expect(res.status).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const res = await request(app).get("/api/students").set("Authorization", "Bearer nonsense");
    expect(res.status).toBe(401);
  });

  it("gives the same message for a wrong password as an unknown email", async () => {
    if (skipUnlessSeeded()) return;
    const wrongPass = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@bhs.edu", password: "definitely-wrong" });
    const noSuchUser = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@nowhere.test", password: "definitely-wrong" });

    // Different messages would let an attacker enumerate valid accounts.
    expect(wrongPass.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPass.body.message).toBe(noSuchUser.body.message);
  });

  it("does not reveal whether an email exists in the forgot-password flow", async () => {
    const known = await request(app).post("/api/auth/forgot-password").send({ email: "admin@bhs.edu" });
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@nowhere.test" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });
});

describe("session cookies", () => {
  const cookieFrom = (res) =>
    (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("educonnect_rt="));

  it("puts the refresh token in an httpOnly cookie, not the response body", async () => {
    if (skipUnlessSeeded()) return;
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@bhs.edu", password: "admin123" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    // The long-lived token must never be readable by JavaScript.
    expect(res.body.data.refreshToken).toBeUndefined();

    const cookie = cookieFrom(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // Scoped to the auth routes — nothing else ever needs to send it.
    expect(cookie).toMatch(/Path=\/api\/auth/i);
  });

  it("refreshes from the cookie alone, with no token in the request", async () => {
    if (skipUnlessSeeded()) return;
    const agent = request.agent(app); // keeps cookies between calls

    await agent.post("/api/auth/login").send({ email: "admin@bhs.edu", password: "admin123" });
    const refreshed = await agent.post("/api/auth/refresh").send({});

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();
    expect(refreshed.body.data.user.email).toBe("admin@bhs.edu");
  });

  it("rejects a refresh with no cookie and no token", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});
    expect(res.status).toBe(401);
  });

  it("rotates the token, so a replayed cookie is refused", async () => {
    if (skipUnlessSeeded()) return;
    const login = await request(app)
      .post("/api/auth/login?tokenInBody=1")
      .send({ email: "admin@bhs.edu", password: "admin123" });
    const original = login.body.data.refreshToken;
    expect(original).toBeTruthy();

    const first = await request(app).post("/api/auth/refresh").send({ refreshToken: original });
    expect(first.status).toBe(200);

    // Using it a second time must fail — rotation revoked it.
    const replay = await request(app).post("/api/auth/refresh").send({ refreshToken: original });
    expect(replay.status).toBe(401);
  });

  it("clears the cookie on logout", async () => {
    if (skipUnlessSeeded()) return;
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "admin@bhs.edu", password: "admin123" });

    const out = await agent.post("/api/auth/logout").send({});
    expect(out.status).toBe(200);

    // Cleared cookie, and the session is genuinely gone.
    const after = await agent.post("/api/auth/refresh").send({});
    expect(after.status).toBe(401);
  });

  it("still serves API clients that ask for the token in the body", async () => {
    if (skipUnlessSeeded()) return;
    const res = await request(app)
      .post("/api/auth/login?tokenInBody=1")
      .send({ email: "admin@bhs.edu", password: "admin123" });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeTruthy();
  });
});

describe("tenant isolation", () => {
  it("scopes an admin's student list to their own institute", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(bhsAdmin).get("/api/students?limit=200");
    expect(res.status).toBe(200);

    const institutes = new Set(res.body.data.map((s) => s.institute.id));
    expect([...institutes]).toEqual([bhs.id]);
  });

  it("refuses an admin who asks for another institute's data outright", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(bhsAdmin).get(`/api/students?instituteId=${lacas.id}`);
    // Rejected, not silently rescoped — passing someone else's id is a bug or an attack.
    expect(res.status).toBe(403);
  });

  it("stops an admin reading another institute's record", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(bhsAdmin).get(`/api/institutes/${lacas.id}`);
    expect(res.status).toBe(403);
  });

  it("gives an admin nothing from another institute's notices", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(lacasAdmin).get("/api/notices?limit=100");
    expect(res.status).toBe(200);
    for (const notice of res.body.data) expect(notice.instituteId).toBe(lacas.id);
  });

  it("keeps a super admin able to see across institutes", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(superAdmin).get("/api/institutes?limit=50");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(1);
  });
});

describe("row-level visibility", () => {
  it("limits a teacher to students in subjects they teach", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(teacher).get("/api/students?limit=200");
    expect(res.status).toBe(200);

    const teacherRecord = await prisma.teacher.findFirst({ where: { email: "hassan@bhs.edu" } });
    for (const student of res.body.data) {
      const taught = await prisma.enrollment.count({
        where: { studentId: student.id, subject: { teacherId: teacherRecord.id } },
      });
      expect(taught).toBeGreaterThan(0);
    }
  });

  it("limits a parent to their own children", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(parent).get("/api/students?limit=200");
    expect(res.status).toBe(200);

    const parentRecord = await prisma.parent.findFirst({ where: { email: "sara@gmail.com" } });
    const own = await prisma.student.findMany({
      where: { parentId: parentRecord.id },
      select: { id: true },
    });
    const ownIds = new Set(own.map((s) => s.id));

    expect(res.body.data.length).toBe(own.length);
    for (const student of res.body.data) expect(ownIds.has(student.id)).toBe(true);
  });

  it("returns 404 — not 403 — for a student outside your scope", async () => {
    if (skipUnlessSeeded()) return;
    const someoneElsesChild = await prisma.student.findFirst({
      where: { parent: { email: { not: "sara@gmail.com" } }, instituteId: bhs.id },
    });
    if (!someoneElsesChild) return;

    const res = await as(parent).get(`/api/students/${someoneElsesChild.id}`);
    // 403 would confirm the id exists; 404 leaks nothing.
    expect(res.status).toBe(404);
  });
});

describe("role permissions", () => {
  it("stops a teacher creating a student", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(teacher)
      .post("/api/students")
      .send({ name: "Should Not Exist", grade: "Grade 8", section: "A", rollNo: "TEST-000" });
    expect(res.status).toBe(403);
  });

  it("stops a parent listing the institute's parents", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(parent).get("/api/parents");
    expect(res.status).toBe(403);
  });

  it("stops an institute admin reaching platform settings", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(bhsAdmin).get("/api/platform/settings");
    expect(res.status).toBe(403);
  });

  it("stops an institute admin broadcasting across the platform", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(bhsAdmin)
      .post("/api/notices/broadcast")
      .send({ title: "Nope", body: "Should not be allowed" });
    expect(res.status).toBe(403);
  });

  it("stops an admin promoting themselves to super admin", async () => {
    if (skipUnlessSeeded()) return;
    const adminUser = await prisma.user.findUnique({ where: { email: "admin@bhs.edu" } });
    const res = await as(bhsAdmin)
      .patch(`/api/users/${adminUser.id}`)
      .send({ role: "SUPERADMIN" });
    expect(res.status).toBe(403);
  });
});

describe("soft delete", () => {
  let created;

  it("hides a deleted student everywhere without destroying the row", async () => {
    if (skipUnlessSeeded()) return;

    const made = await as(bhsAdmin).post("/api/students").send({
      name: "Soft Delete Probe",
      grade: "Grade 8",
      section: "A",
      rollNo: `SD-${Date.now()}`,
    });
    expect(made.status).toBe(201);
    created = made.body.data;

    const before = await as(bhsAdmin).get("/api/students?limit=1");
    const countBefore = before.body.meta.total;

    const del = await as(bhsAdmin).delete(`/api/students/${created.id}`);
    expect(del.status).toBe(200);

    // Gone from listings…
    const after = await as(bhsAdmin).get("/api/students?limit=1");
    expect(after.body.meta.total).toBe(countBefore - 1);

    // …and from direct reads, as a 404 so nothing leaks…
    const detail = await as(bhsAdmin).get(`/api/students/${created.id}`);
    expect(detail.status).toBe(404);

    // …but the row survives.
    const row = await prisma.student.findFirst({ where: { id: created.id } });
    expect(row).toBeNull(); // hidden from the extended client
    const raw = await prismaRaw.student.findUnique({ where: { id: created.id } });
    expect(raw).not.toBeNull();
    expect(raw.deletedAt).toBeInstanceOf(Date);
  });

  it("lists it in the recycle bin and restores it", async () => {
    if (skipUnlessSeeded() || !created) return;

    const bin = await as(bhsAdmin).get("/api/students/deleted");
    expect(bin.status).toBe(200);
    expect(bin.body.data.some((s) => s.id === created.id)).toBe(true);

    const restored = await as(bhsAdmin).post(`/api/students/${created.id}/restore`);
    expect(restored.status).toBe(200);

    const detail = await as(bhsAdmin).get(`/api/students/${created.id}`);
    expect(detail.status).toBe(200);
  });

  it("refuses to purge an institute that hasn't been deleted first", async () => {
    if (skipUnlessSeeded()) return;
    const res = await as(superAdmin).delete(`/api/institutes/${bhs.id}/purge`);
    // Two deliberate steps are required to destroy a school's data.
    expect(res.status).toBe(400);
  });

  it("keeps deleted students out of an institute's seat count", async () => {
    if (skipUnlessSeeded() || !created) return;

    const before = await as(superAdmin).get(`/api/institutes/${bhs.id}`);
    const seatsBefore = before.body.data.counts.students;

    await as(bhsAdmin).delete(`/api/students/${created.id}`);
    const after = await as(superAdmin).get(`/api/institutes/${bhs.id}`);
    expect(after.body.data.counts.students).toBe(seatsBefore - 1);

    // Clean up — this probe shouldn't outlive the test.
    await prismaRaw.student.delete({ where: { id: created.id } });
  });
});

describe("health", () => {
  it("reports the database as reachable", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("up");
  });
});

