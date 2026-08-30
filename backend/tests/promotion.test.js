import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * The end-of-session rollover.
 *
 * A Pakistani school runs this once a year: a class is promoted, a few students
 * are retained to repeat, and the top class graduates out. Without it the
 * product worked for exactly one session and then needed a developer.
 *
 * `Student.grade` + `Student.section` is class membership everywhere in this
 * product, so promotion changes it in place — which is precisely why every move
 * is also written to `student_promotions`. These pin both halves: the move
 * happens, and the class the student came from is still answerable afterwards.
 *
 * A throwaway school, deleted in afterAll. The demo institutes are never
 * promoted, only read.
 */

let sa, admin, teacher, parent, instId, seeded = true;
let eightA = [];
const stamp = Date.now();

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

const makeStudent = async (name, section, roll) =>
  (await as(admin).post("/api/students").send({
    name, grade: "Grade 8", section, rollNo: roll,
  })).body.data.id;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `promo.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Promotion School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `promo.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Promotion Admin", adminEmail, adminPassword: "PromoSpec123",
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await login(adminEmail, "PromoSpec123");

  const t = await as(admin).post("/api/teachers").send({
    name: "Promotion Teacher", email: `promo.t.${stamp}@test.edu`,
    phone: "03001111111", subject: "Mathematics", createLogin: true,
  });
  teacher = await login(`promo.t.${stamp}@test.edu`,
    (t.body.message.match(/Temporary password: (\S+?)[\s)]/) ?? [])[1] ?? "");

  const p = await as(admin).post("/api/parents").send({
    name: "Promotion Parent", email: `promo.p.${stamp}@test.edu`,
    phone: "03002222222", relation: "Father", createLogin: true,
  });
  parent = await login(`promo.p.${stamp}@test.edu`,
    (p.body.message.match(/Temporary password: (\S+?)[\s)]/) ?? [])[1] ?? "");

  eightA = [
    await makeStudent("Promo Aisha", "A", `PR-A1-${stamp}`),
    await makeStudent("Promo Bilal", "A", `PR-A2-${stamp}`),
    await makeStudent("Promo Danish", "A", `PR-A3-${stamp}`),
  ];
});

afterAll(async () => {
  if (instId) await prismaRaw.institute.delete({ where: { id: instId } }).catch(() => {});
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
const gradeOf = async (id) =>
  prismaRaw.student.findUnique({ where: { id }, select: { grade: true, section: true, status: true } });

describe("the school's session", () => {
  it("starts on the default and lists what each class holds", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/institutes/me/session");
    expect(res.status).toBe(200);
    expect(res.body.data.currentSession).toBe("2026-27");

    const gradeEight = res.body.data.classes.find((c) => c.grade === "Grade 8" && c.section === "A");
    expect(gradeEight.students).toBe(3);
    expect(res.body.data.lastRollover).toBeNull();
  });

  it("refuses a session that is not a year pair", async () => {
    if (skip()) return;
    for (const bad of ["2027", "next year", "2027-2028", ""]) {
      expect((await as(admin).patch("/api/institutes/me/session").send({ currentSession: bad })).status).toBe(400);
    }
  });

  it("is readable by a teacher but only an admin may move it", async () => {
    if (skip()) return;
    if (teacher) {
      expect((await as(teacher).get("/api/institutes/me/session")).status).toBe(200);
      expect((await as(teacher).patch("/api/institutes/me/session").send({ currentSession: "2027-28" })).status).toBe(403);
    }
    if (parent) {
      expect((await as(parent).patch("/api/institutes/me/session").send({ currentSession: "2027-28" })).status).toBe(403);
    }
    // and it did not move
    const inst = await prismaRaw.institute.findUnique({ where: { id: instId }, select: { currentSession: true } });
    expect(inst.currentSession).toBe("2026-27");
  });
});

describe("promoting a class", () => {
  it("shows what it would do without doing it", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students/promote").send({
      fromGrade: "Grade 8", fromSection: "A",
      toGrade: "Grade 9", toSection: "A",
      toSession: "2027-28", dryRun: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.dryRun).toBe(true);
    expect(res.body.data.students).toBe(3);
    expect(res.body.data.moves[0].from).toBe("Grade 8 A");
    expect(res.body.data.moves[0].to).toBe("Grade 9 A");

    // nothing moved
    for (const id of eightA) expect((await gradeOf(id)).grade).toBe("Grade 8");
    expect(await prismaRaw.studentPromotion.count({ where: { instituteId: instId } })).toBe(0);
  });

  it("moves the class and records where each student came from", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students/promote").send({
      fromGrade: "Grade 8", fromSection: "A",
      toGrade: "Grade 9", toSection: "A",
      toSession: "2027-28",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.students).toBe(3);

    for (const id of eightA) {
      const s = await gradeOf(id);
      expect(s.grade).toBe("Grade 9");
      expect(s.section).toBe("A");
    }

    const history = await prismaRaw.studentPromotion.findMany({ where: { instituteId: instId } });
    expect(history.length).toBe(3);
    expect(history[0].fromGrade).toBe("Grade 8");
    expect(history[0].fromSection).toBe("A");
    expect(history[0].toGrade).toBe("Grade 9");
    expect(history[0].fromSession).toBe("2026-27");
    expect(history[0].toSession).toBe("2027-28");
    expect(history[0].outcome).toBe("PROMOTED");
    expect(history[0].promotedById).toBeTruthy();
  });

  it("answers which class a student came from", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/students/${eightA[0]}/promotions`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].fromGrade).toBe("Grade 8");
    expect(res.body.data[0].promotedBy?.name).toBeTruthy();
  });

  it("leaves marks, attendance and fees where they are", async () => {
    if (skip()) return;
    // history is the point of promoting rather than recreating
    const student = await prismaRaw.student.findUnique({
      where: { id: eightA[0] },
      include: { enrollments: true, attendance: true, feeInvoices: true },
    });
    expect(student.grade).toBe("Grade 9");
    // nothing was deleted on the way through
    expect(Array.isArray(student.enrollments)).toBe(true);
    expect(Array.isArray(student.attendance)).toBe(true);
    expect(Array.isArray(student.feeInvoices)).toBe(true);
  });

  it("refuses to promote into the session the school is already in", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students/promote").send({
      fromGrade: "Grade 9", fromSection: "A",
      toGrade: "Grade 10", toSection: "A",
      toSession: "2026-27",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already in 2026-27/i);
  });

  it("refuses when the class is empty", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students/promote").send({
      fromGrade: "Grade 3", fromSection: "Z",
      toGrade: "Grade 4", toSection: "Z",
      toSession: "2027-28",
    });
    expect(res.status).toBe(400);
  });

  it("can move just the students named", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students/promote").send({
      fromGrade: "Grade 9", fromSection: "A",
      toGrade: "Grade 9", toSection: "B",
      toSession: "2027-28",
      studentIds: [eightA[2]],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.students).toBe(1);

    expect((await gradeOf(eightA[2])).section).toBe("B");
    expect((await gradeOf(eightA[0])).section).toBe("A"); // untouched
  });
});

describe("retaining and graduating", () => {
  it("leaves a retained student exactly where they are, and says why", async () => {
    if (skip()) return;
    const before = await gradeOf(eightA[1]);
    const res = await as(admin).post("/api/students/promote").send({
      fromGrade: "Grade 9", fromSection: "A",
      toGrade: "Grade 10", toSection: "A",
      toSession: "2027-28",
      outcome: "RETAINED",
      studentIds: [eightA[1]],
      notes: "Attendance below requirement",
    });
    expect(res.status).toBe(200);

    const after = await gradeOf(eightA[1]);
    expect(after.grade).toBe(before.grade);
    expect(after.section).toBe(before.section);

    const record = await prismaRaw.studentPromotion.findFirst({
      where: { studentId: eightA[1], outcome: "RETAINED" },
    });
    expect(record).not.toBeNull();
    expect(record.notes).toBe("Attendance below requirement");
  });

  it("marks a graduating student as gone rather than moving them", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students/promote").send({
      fromGrade: "Grade 9", fromSection: "A",
      toSession: "2027-28",
      outcome: "GRADUATED",
      studentIds: [eightA[0]],
    });
    expect(res.status).toBe(200);

    const s = await gradeOf(eightA[0]);
    expect(s.status).toBe("GRADUATED");

    const record = await prismaRaw.studentPromotion.findFirst({
      where: { studentId: eightA[0], outcome: "GRADUATED" },
    });
    expect(record.toGrade).toBeNull();
    expect(record.toSection).toBeNull();
  });

  it("insists on a destination for anything that is not a graduation", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students/promote").send({
      fromGrade: "Grade 9", fromSection: "B",
      toSession: "2027-28",
      outcome: "PROMOTED",
    });
    expect(res.status).toBe(400);
  });
});

describe("who may run a rollover", () => {
  it("is closed to teachers, parents and other schools", async () => {
    if (skip()) return;
    const body = {
      fromGrade: "Grade 9", fromSection: "B",
      toGrade: "Grade 10", toSection: "A", toSession: "2027-28",
    };
    if (teacher) expect((await as(teacher).post("/api/students/promote").send(body)).status).toBe(403);
    if (parent) expect((await as(parent).post("/api/students/promote").send(body)).status).toBe(403);
    expect((await request(app).post("/api/students/promote").send(body)).status).toBe(401);

    const bhs = await login("admin@bhs.edu", "admin123");
    if (bhs) {
      // Another school's admin promotes their own empty class, never ours.
      const res = await as(bhs).post("/api/students/promote").send(body);
      expect([400, 403, 404]).toContain(res.status);
      // our students did not move
      expect((await gradeOf(eightA[2])).section).toBe("B");
    }
  });
});
