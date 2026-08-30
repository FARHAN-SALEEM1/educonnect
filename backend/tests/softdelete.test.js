import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Soft-deleted rows must stop counting, but must keep their code.
 *
 * Two blocking bugs lived in the gap between those two facts:
 *
 *  - Codes were numbered off a *filtered* count, while the unique index on
 *    (instituteId, code) still held the deleted row's code. Deleting one
 *    teacher was enough to make every later teacher creation fail with
 *    "A record with this instituteId, code already exists".
 *
 *  - The seat check counted students through a nested `_count`, which the
 *    soft-delete extension does not reach, so a removed student occupied its
 *    seat forever — /institutes/me/subscription reported a seat free while
 *    POST /students refused to use it.
 */

let admin, instituteId, seeded = true;
const MARK = "SoftDeleteSpec";
const created = { teachers: [], students: [] };

const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});

beforeAll(async () => {
  const res = await request(app).post("/api/auth/login").send({ email: "admin@bhs.edu", password: "admin123" });
  if (res.status !== 200) { seeded = false; return; }
  admin = res.body.data.accessToken;
  instituteId = res.body.data.user.instituteId;
});

afterAll(async () => {
  if (!seeded) return;
  // Hard-delete so repeated runs don't accumulate soft-deleted rows.
  await prismaRaw.enrollment.deleteMany({ where: { studentId: { in: created.students } } }).catch(() => {});
  await prismaRaw.student.deleteMany({ where: { OR: [{ id: { in: created.students } }, { name: { contains: MARK } }] } });
  await prismaRaw.teacher.deleteMany({ where: { OR: [{ id: { in: created.teachers } }, { name: { contains: MARK } }] } });
  await prismaRaw.user.deleteMany({ where: { name: { contains: MARK } } });
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

describe("codes survive a soft delete", () => {
  it("issues a fresh teacher code after one has been deleted", async () => {
    if (skip()) return;

    const first = await as(admin).post("/api/teachers").send({
      name: `${MARK} Teacher A`, email: `sd.a.${Date.now()}@bhs.edu`, createLogin: false,
    });
    expect(first.status).toBe(201);
    created.teachers.push(first.body.data.id);
    const firstCode = first.body.data.code;

    // Soft-delete it — the row keeps its code in the unique index.
    expect((await as(admin).delete(`/api/teachers/${first.body.data.id}`)).status).toBe(200);

    // The next create must not try to reuse that code.
    const second = await as(admin).post("/api/teachers").send({
      name: `${MARK} Teacher B`, email: `sd.b.${Date.now()}@bhs.edu`, createLogin: false,
    });
    expect(second.status, `expected 201, got ${second.status}: ${second.body?.message}`).toBe(201);
    created.teachers.push(second.body.data.id);
    expect(second.body.data.code).not.toBe(firstCode);
  });

  it("issues a fresh student code after one has been deleted", async () => {
    if (skip()) return;

    const first = await as(admin).post("/api/students").send({
      name: `${MARK} Student A`, grade: "Grade 8", section: "A", rollNo: `SD-A-${Date.now()}`,
    });
    expect(first.status).toBe(201);
    created.students.push(first.body.data.id);
    const firstCode = first.body.data.code;

    expect((await as(admin).delete(`/api/students/${first.body.data.id}`)).status).toBe(200);

    const second = await as(admin).post("/api/students").send({
      name: `${MARK} Student B`, grade: "Grade 8", section: "A", rollNo: `SD-B-${Date.now()}`,
    });
    expect(second.status, `expected 201, got ${second.status}: ${second.body?.message}`).toBe(201);
    created.students.push(second.body.data.id);
    expect(second.body.data.code).not.toBe(firstCode);
  });
});

describe("deleted students release their seat", () => {
  it("agrees with the subscription endpoint about seats used", async () => {
    if (skip()) return;

    const sub = await as(admin).get("/api/institutes/me/subscription");
    expect(sub.status).toBe(200);
    const live = await prismaRaw.student.count({ where: { instituteId, deletedAt: null } });
    expect(sub.body.data.seatsUsed).toBe(live);
  });

  it("lets a freed seat be reused", async () => {
    if (skip()) return;

    const live = await prismaRaw.student.count({ where: { instituteId, deletedAt: null } });

    // Cap exactly at the live count: full right now.
    await as(admin).patch("/api/institutes/me/subscription/limit").send({ studentLimit: live });
    const refused = await as(admin).post("/api/students").send({
      name: `${MARK} Overflow`, grade: "Grade 8", section: "A", rollNo: `SD-OVER-${Date.now()}`,
    });
    expect(refused.status, "a full institute must refuse").toBe(400);

    // Raise by one and it must fit — the deleted rows sitting in this
    // institute must not silently consume that seat.
    await as(admin).patch("/api/institutes/me/subscription/limit").send({ studentLimit: live + 1 });
    const accepted = await as(admin).post("/api/students").send({
      name: `${MARK} Fits`, grade: "Grade 8", section: "A", rollNo: `SD-FIT-${Date.now()}`,
    });
    expect(accepted.status, `expected 201, got ${accepted.status}: ${accepted.body?.message}`).toBe(201);
    created.students.push(accepted.body.data.id);

    // Restore the institute to following its plan.
    await as(admin).patch("/api/institutes/me/subscription/limit").send({ studentLimit: null });
  });
});

/**
 * The recycle bin.
 *
 * `deleteStudent` has always answered "Restorable from the recycle bin", and
 * for a long time there was no recycle bin — `/deleted` and `/:id/restore`
 * existed on students, teachers and parents but nothing in the app reached
 * them. The admin portal now does, so the round trip and its guards are
 * pinned here.
 */
describe("the recycle bin round trip", () => {
  const bin = { students: [], teachers: [], parents: [] };

  afterAll(async () => {
    if (!seeded) return;
    await prismaRaw.student.deleteMany({ where: { id: { in: bin.students } } }).catch(() => {});
    for (const id of bin.teachers) {
      const row = await prismaRaw.teacher.findUnique({ where: { id }, select: { userId: true } }).catch(() => null);
      await prismaRaw.teacher.delete({ where: { id } }).catch(() => {});
      if (row?.userId) await prismaRaw.user.delete({ where: { id: row.userId } }).catch(() => {});
    }
    for (const id of bin.parents) {
      const row = await prismaRaw.parent.findUnique({ where: { id }, select: { userId: true } }).catch(() => null);
      await prismaRaw.parent.delete({ where: { id } }).catch(() => {});
      if (row?.userId) await prismaRaw.user.delete({ where: { id: row.userId } }).catch(() => {});
    }
  });

  it("takes a student out of the list, into the bin, and back again", async () => {
    if (skip()) return;
    const made = await as(admin).post("/api/students").send({
      name: `${MARK} BinStudent`, grade: "Grade 10", section: "Z", rollNo: `SD-BIN-${Date.now()}`,
    });
    expect(made.status).toBe(201);
    const id = made.body.data.id;
    bin.students.push(id);

    expect((await as(admin).delete(`/api/students/${id}`)).status).toBe(200);

    // Soft, not hard — the row and its relations are still there.
    const row = await prismaRaw.student.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row.deletedAt).not.toBeNull();

    // Out of the live list, out of reach by id, but listed in the bin.
    const live = await as(admin).get("/api/students?limit=200");
    expect(live.body.data.some((x) => x.id === id)).toBe(false);
    expect((await as(admin).get(`/api/students/${id}`)).status).toBe(404);

    const deleted = await as(admin).get("/api/students/deleted");
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.some((x) => x.id === id)).toBe(true);

    expect((await as(admin).post(`/api/students/${id}/restore`)).status).toBe(200);
    expect((await prismaRaw.student.findUnique({ where: { id } })).deletedAt).toBeNull();
    const back = await as(admin).get("/api/students?limit=200");
    expect(back.body.data.some((x) => x.id === id)).toBe(true);
  });

  it("does the same for a teacher", async () => {
    if (skip()) return;
    const made = await as(admin).post("/api/teachers").send({
      name: `${MARK} BinTeacher`, email: `sd.bin.t${Date.now()}@example.com`,
      phone: "03001234567", subject: "Mathematics",
    });
    expect(made.status).toBe(201);
    const id = made.body.data.id;
    bin.teachers.push(id);

    expect((await as(admin).delete(`/api/teachers/${id}`)).status).toBe(200);
    const deleted = await as(admin).get("/api/teachers/deleted");
    expect(deleted.body.data.some((x) => x.id === id)).toBe(true);
    expect((await as(admin).post(`/api/teachers/${id}/restore`)).status).toBe(200);
    expect((await as(admin).get("/api/teachers?limit=200")).body.data.some((x) => x.id === id)).toBe(true);
  });

  it("does the same for a parent", async () => {
    if (skip()) return;
    const made = await as(admin).post("/api/parents").send({
      name: `${MARK} BinParent`, email: `sd.bin.p${Date.now()}@example.com`,
      phone: "03001234567", relation: "Father",
    });
    expect(made.status).toBe(201);
    const id = made.body.data.id;
    bin.parents.push(id);

    expect((await as(admin).delete(`/api/parents/${id}`)).status).toBe(200);
    const deleted = await as(admin).get("/api/parents/deleted");
    expect(deleted.body.data.some((x) => x.id === id)).toBe(true);
    expect((await as(admin).post(`/api/parents/${id}/restore`)).status).toBe(200);
  });

  it("keeps a teacher out of the bin entirely", async () => {
    if (skip()) return;
    const res = await request(app).post("/api/auth/login").send({ email: "hassan@bhs.edu", password: "teach123" });
    if (res.status !== 200) return;
    const teacher = res.body.data.accessToken;

    expect((await as(teacher).get("/api/students/deleted")).status).toBe(403);
    expect((await as(teacher).get("/api/teachers/deleted")).status).toBe(403);
    expect((await as(teacher).post("/api/students/whatever/restore")).status).toBe(403);
  });

  it("will not let one institute restore another's records", async () => {
    if (skip()) return;
    const made = await as(admin).post("/api/students").send({
      name: `${MARK} BinTenant`, grade: "Grade 10", section: "Z", rollNo: `SD-TEN-${Date.now()}`,
    });
    const id = made.body.data.id;
    bin.students.push(id);
    await as(admin).delete(`/api/students/${id}`);

    const other = await request(app).post("/api/auth/login").send({ email: "admin@lacas.edu", password: "admin123" });
    if (other.status !== 200) return;
    const lacas = other.body.data.accessToken;

    expect((await as(lacas).get("/api/students/deleted")).body.data.some((x) => x.id === id)).toBe(false);
    expect((await as(lacas).post(`/api/students/${id}/restore`)).status).toBe(404);

    // still deleted, and still ours to restore
    expect((await prismaRaw.student.findUnique({ where: { id } })).deletedAt).not.toBeNull();
    expect((await as(admin).post(`/api/students/${id}/restore`)).status).toBe(200);
  });
});
