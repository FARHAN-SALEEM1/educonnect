import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { assessmentAverage } from "../src/utils/academics.js";

/**
 * A subject score has exactly one writer: the marks.
 *
 * It used to have two. Assessments recomputed it through `recalcEnrollment`,
 * and Quick Grade Entry set it by hand through `PATCH /subjects/enrollments/:id`
 * — last write won, silently. A result card could therefore quote a number the
 * marks underneath flatly contradicted, which is exactly the number a Pakistani
 * parent turns up to argue about with the test paper in hand.
 *
 * The product decision has been made: marks win. `currentScore` is a derived
 * cache, the hand-write paths are refused, and a subject with no marks reports
 * no score rather than keeping a stale one.
 *
 * `marksAverage` and `POST /subjects/:id/recalculate` both survive, because rows
 * written before this change still exist and still need reconciling.
 *
 * Everything here happens in a throwaway school, deleted in afterAll.
 */

let sa, admin, teacher, instId, seeded = true;
let subjectId, enrollmentId, studentId;
const stamp = Date.now();

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
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `recon.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Reconcile School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `recon.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Reconcile Admin", adminEmail, adminPassword: "ReconSpec123",
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await login(adminEmail, "ReconSpec123");

  const t = await as(admin).post("/api/teachers").send({
    name: "Reconcile Teacher", email: `recon.t.${stamp}@test.edu`,
    phone: "03001111111", subject: "Mathematics", createLogin: true,
  });
  teacher = await login(`recon.t.${stamp}@test.edu`,
    (t.body.message.match(/Temporary password: (\S+?)[\s)]/) ?? [])[1] ?? "");

  studentId = (await as(admin).post("/api/students").send({
    name: "Reconcile Student", grade: "Grade 8", section: "A", rollNo: `RC-${stamp}`,
  })).body.data.id;

  subjectId = (await as(admin).post("/api/subjects").send({
    name: "Mathematics", grade: "Grade 8", teacherId: t.body.data.id, code: `RC-${stamp}`,
  })).body.data.id;

  enrollmentId = (await as(admin).post("/api/subjects/enroll").send({ studentId, subjectId })).body.data.id;

  // One real mark: 40 out of 50, so the marks say 80.
  await as(admin).post("/api/assessments").send({
    studentId, subjectId, title: "Term Paper", type: "EXAM", obtained: 40, total: 50,
  });
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

const report = async () =>
  (await as(admin).get(`/api/students/${studentId}/report`)).body.data;

/** Subjects are not returned in a fixed order, so never reach for index 0. */
const subjectNamed = async (name) => (await report()).subjects.find((s) => s.name === name);

describe("a hand-entered score that contradicts the marks", () => {
  it("starts out agreeing, because the mark set it", async () => {
    if (skip()) return;
    const subject = await subjectNamed("Mathematics");
    expect(subject.score).toBe(80);
    expect(subject.marksAverage).toBe(80);
    expect(subject.assessmentCount).toBe(1);
  });

  it("cannot be typed over any more, by a teacher or anyone else", async () => {
    if (skip()) return;
    const res = await as(teacher).patch(`/api/subjects/enrollments/${enrollmentId}`).send({ currentScore: 23 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/assessments/i);

    // The refused write changed nothing.
    const subject = await subjectNamed("Mathematics");
    expect(subject.score).toBe(80);
    expect(subject.marksAverage).toBe(80);
  });

  it("cannot be smuggled in at enrolment time either", async () => {
    if (skip()) return;
    const other = (await as(admin).post("/api/subjects").send({
      name: "Urdu", grade: "Grade 8", code: `RCU-${stamp}`,
    })).body.data.id;

    const refused = await as(admin).post("/api/subjects/enroll").send({
      studentId, subjectId: other, currentScore: 94,
    });
    expect(refused.status).toBe(400);

    // Enrolling properly gives a subject with no score at all, which is the
    // honest state for a subject nobody has marked yet.
    const enrol = await as(admin).post("/api/subjects/enroll").send({ studentId, subjectId: other });
    expect(enrol.status).toBe(201);
    expect(enrol.body.data.currentScore).toBeNull();

    const subject = await subjectNamed("Urdu");
    expect(subject.score ?? null).toBeNull();
    expect(subject.marksAverage).toBeNull();
    expect(subject.assessmentCount).toBe(0);
  });

  it("moves the moment a mark is recorded, and follows it back down", async () => {
    if (skip()) return;
    const mark = await as(teacher).post("/api/assessments").send({
      studentId, subjectId, title: "Reconcile Quiz", type: "QUIZ", obtained: 20, total: 100,
    });
    expect(mark.status).toBe(201);

    /**
     * The expectation is asked of the marks rather than written in, because
     * `assessmentAverage` weights by total marks — it is the sum of what was
     * obtained over the sum of what was available, not the mean of two
     * percentages. Hard-coding a figure here would pin the setup's mark shape
     * instead of the rule under test.
     */
    const row = await prismaRaw.enrollment.findUnique({
      where: { id: enrollmentId }, include: { assessments: true },
    });
    expect(row.assessments).toHaveLength(2);

    const after = await subjectNamed("Mathematics");
    expect(after.score).toBe(assessmentAverage(row.assessments));
    expect(after.score).toBe(after.marksAverage);
    expect(after.score).toBeLessThan(80);

    await as(teacher).delete(`/api/assessments/${mark.body.data.id}`);
    const back = await subjectNamed("Mathematics");
    expect(back.score).toBe(80);
  });

  it("is the same number the gradebook reports", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/assessments/gradebook?subjectId=${subjectId}`);
    expect(res.status).toBe(200);
    const row = res.body.data.rows.find((r) => r.student.id === studentId);
    expect(row.average).toBe(80);
    expect(row.marksAverage).toBe(80);
  });
});

describe("recalculating a subject from its marks", () => {
  it("puts a legacy hand-written score back in step with them", async () => {
    if (skip()) return;
    /**
     * Written straight to the database, because that is the only way such a row
     * can exist now — the API refuses it. Rows like this were left behind by the
     * old two-writer world, and are what `recalculate` is still for.
     */
    await prismaRaw.enrollment.update({
      where: { id: enrollmentId },
      data: { currentScore: 23, letterGrade: "F" },
    });
    expect((await subjectNamed("Mathematics")).score).toBe(23);

    const res = await as(admin).post(`/api/subjects/${subjectId}/recalculate`);
    expect(res.status).toBe(200);
    expect(res.body.data.enrollments).toBeGreaterThan(0);

    const subject = await subjectNamed("Mathematics");
    expect(subject.score).toBe(80);
    expect(subject.score).toBe(subject.marksAverage);

    const row = await prismaRaw.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { assessments: true },
    });
    expect(row.currentScore).toBe(assessmentAverage(row.assessments));
  });

  /**
   * The counterpart of the rule above: a score with nothing behind it is exactly
   * what this change removes, so recalculating clears it rather than preserving
   * it. The early return in `recalcEnrollment` used to leave such a number
   * standing for ever.
   */
  it("clears a score that has no marks behind it", async () => {
    if (skip()) return;
    const urduId = (await prismaRaw.subject.findFirst({
      where: { name: "Urdu", instituteId: instId }, select: { id: true },
    })).id;
    await prismaRaw.enrollment.updateMany({
      where: { studentId, subjectId: urduId },
      data: { currentScore: 94, letterGrade: "A+" },
    });
    expect((await subjectNamed("Urdu")).score).toBe(94);

    expect((await as(admin).post(`/api/subjects/${urduId}/recalculate`)).status).toBe(200);

    const urdu = await subjectNamed("Urdu");
    expect(urdu.score ?? null).toBeNull();
    expect(urdu.marksAverage).toBeNull();
  });

  /**
   * The subject's own teacher may do this. It only ever recomputes from marks
   * they already own, so it hands them no authority they did not have, and it
   * belongs on the screen where a legacy divergence is actually seen.
   */
  it("is open to the subject's own teacher", async () => {
    if (skip() || !teacher) return;
    expect((await as(teacher).post(`/api/subjects/${subjectId}/recalculate`)).status).toBe(200);
  });

  it("is closed to a teacher who does not hold the subject", async () => {
    if (skip()) return;
    const other = (await as(admin).post("/api/subjects").send({
      name: "Not Theirs", grade: "Grade 8", code: `RCX-${stamp}`,
    })).body.data.id;
    if (teacher) {
      // findAccessibleSubject answers 404, not 403 — a 403 would confirm the id.
      expect((await as(teacher).post(`/api/subjects/${other}/recalculate`)).status).toBe(404);
    }
  });

  it("is closed to an unauthenticated caller", async () => {
    if (skip()) return;
    expect((await request(app).post(`/api/subjects/${subjectId}/recalculate`)).status).toBe(401);
  });

  it("will not reach into another institute", async () => {
    if (skip()) return;
    const other = await login("admin@bhs.edu", "admin123");
    if (!other) return;
    expect((await as(other).post(`/api/subjects/${subjectId}/recalculate`)).status).toBe(404);
  });
});
