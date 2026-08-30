import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * A school living in its second year.
 *
 * This is the thing the product could not do. A result card carried every
 * enrolment, every attendance row and every invoice a student had ever had —
 * invisible while a school had only ever lived one year, and a serious lie the
 * moment one was promoted, because last year's Grade 8 marks would print on
 * this year's Grade 9 card as though they were current.
 *
 * What has to be true instead, and is what these pin:
 *
 *     GET /students/:id/report                  → Grade 9, 2026-27
 *     GET /students/:id/report?session=2025-26  → Grade 8, 2025-26
 *
 * Two complete cards, each with its own marks, its own attendance, its own
 * fees and its own position — reachable independently, neither contaminating
 * the other.
 *
 * A throwaway school, erased through the application's lifecycle in afterAll.
 */

let sa, admin, instId, seeded = true;
let ali, sana;
let mathsEight, mathsNine;
const made = [];
const stamp = Date.now();
const PASSWORD = "TwoSession!2026";

const signIn = (email, password) => request(app).post("/api/auth/login").send({ email, password });
const tokenFor = async (email, password) => {
  const res = await signIn(email, password);
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});

const purgeSchool = async (id) => {
  const removed = await as(sa).delete(`/api/institutes/${id}`);
  const purged = removed.status === 200 ? await as(sa).delete(`/api/institutes/${id}/purge`) : null;
  if (purged?.status !== 200) await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
};

const report = (studentId, session) =>
  as(admin).get(`/api/students/${studentId}/report${session ? `?session=${session}` : ""}`);

const subjectNamed = (card, name) => card.subjects.find((s) => s.name === name);

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `twosess.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Two Session School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `twosess.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Two Session Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  made.push(instId);
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await tokenFor(adminEmail, PASSWORD);
  if (!admin) { seeded = false; return; }

  /**
   * Start the school in the year before the current one.
   *
   * Signup puts a school in whatever session today falls in, and this spec
   * needs two — so it steps back one year and then rolls forward, which is
   * what a school that has used the app for a year actually did. It used to
   * roll *forward* into 2027-28 instead, and filed marks and a register inside
   * it: a year that has not happened, which nothing was checking.
   */
  await as(admin).patch("/api/institutes/me/session").send({ currentSession: "2025-26" });

  // ── 2025-26: two students in Grade 8 ──────────────────────────────────────
  ali = (await as(admin).post("/api/students").send({
    name: "Ali Raza", grade: "Grade 8", section: "A", rollNo: `TS-1-${stamp}`,
  })).body.data?.id;
  sana = (await as(admin).post("/api/students").send({
    name: "Sana Iqbal", grade: "Grade 8", section: "A", rollNo: `TS-2-${stamp}`,
  })).body.data?.id;

  mathsEight = (await as(admin).post("/api/subjects").send({
    name: "Mathematics", grade: "Grade 8", code: `TS8-${stamp}`,
  })).body.data?.id;
  if (!ali || !sana || !mathsEight) { seeded = false; return; }

  for (const id of [ali, sana]) {
    await as(admin).post("/api/subjects/enroll").send({ studentId: id, subjectId: mathsEight });
  }

  // Grade 8 marks: Ali ahead of Sana.
  await as(admin).post("/api/assessments").send({
    studentId: ali, subjectId: mathsEight, title: "Grade 8 Final",
    type: "EXAM", obtained: 90, total: 100, takenOn: "2025-11-20",
  });
  await as(admin).post("/api/assessments").send({
    studentId: sana, subjectId: mathsEight, title: "Grade 8 Final",
    type: "EXAM", obtained: 60, total: 100, takenOn: "2025-11-20",
  });

  // Grade 8 attendance and a Grade 8 fee challan.
  await as(admin).post("/api/attendance/bulk").send({
    date: "2025-11-10",
    records: [{ studentId: ali, status: "PRESENT" }, { studentId: sana, status: "ABSENT" }],
  });
  await as(admin).post("/api/fees").send({ studentId: ali, period: "2025-11", amount: 8000 });

  /**
   * Promote first, then close the year — the order the product enforces.
   *
   * `promoteStudents` refuses when the session it is promoting *into* is the one
   * the school is already running, and that refusal is the point: a school moves
   * its classes up over several days and only declares the new year once every
   * class has been dealt with. Moving the session first would leave the
   * promotion with nowhere to promote to.
   */
  const promoted = await as(admin).post("/api/students/promote").send({
    fromGrade: "Grade 8", fromSection: "A",
    toGrade: "Grade 9", toSection: "A",
    toSession: "2026-27", outcome: "PROMOTED",
  });
  if (promoted.status !== 200) { seeded = false; return; }

  await as(admin).patch("/api/institutes/me/session").send({ currentSession: "2026-27" });

  // ── 2026-27: Grade 9 subjects, new marks, new attendance, new fees ────────
  mathsNine = (await as(admin).post("/api/subjects").send({
    name: "Mathematics", grade: "Grade 9", code: `TS9-${stamp}`,
  })).body.data?.id;
  if (!mathsNine) { seeded = false; return; }

  for (const id of [ali, sana]) {
    await as(admin).post("/api/subjects/enroll").send({ studentId: id, subjectId: mathsNine });
  }

  // Grade 9 marks: the order reverses — Sana ahead of Ali.
  await as(admin).post("/api/assessments").send({
    studentId: ali, subjectId: mathsNine, title: "Grade 9 Test",
    type: "TEST", obtained: 55, total: 100, takenOn: "2026-05-15",
  });
  await as(admin).post("/api/assessments").send({
    studentId: sana, subjectId: mathsNine, title: "Grade 9 Test",
    type: "TEST", obtained: 95, total: 100, takenOn: "2026-05-15",
  });

  await as(admin).post("/api/attendance/bulk").send({
    date: "2026-05-10",
    records: [{ studentId: ali, status: "ABSENT" }, { studentId: sana, status: "PRESENT" }],
  });
  await as(admin).post("/api/fees").send({ studentId: ali, period: "2026-05", amount: 9500 });
});

afterAll(async () => {
  for (const id of made) await purgeSchool(id);
  await prismaRaw.user
    .deleteMany({ where: { email: { contains: `.${stamp}@test.edu` } } })
    .catch(() => {});
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

describe("this year's card", () => {
  it("reports the year the school is running, and says which", async () => {
    if (skip()) return;
    const res = await report(ali);
    expect(res.status).toBe(200);
    expect(res.body.data.session.name).toBe("2026-27");
    expect(res.body.data.session.isCurrent).toBe(true);
    expect(res.body.data.student.grade).toBe("Grade 9");
  });

  it("carries this year's marks and none of last year's", async () => {
    if (skip()) return;
    const card = (await report(ali)).body.data;

    // One Mathematics, not two — last year's enrolment belongs to last year.
    expect(card.subjects.filter((s) => s.name === "Mathematics")).toHaveLength(1);
    expect(subjectNamed(card, "Mathematics").score).toBe(55);
    expect(card.average).toBe(55);
  });

  it("counts only this year's attendance", async () => {
    if (skip()) return;
    const card = (await report(ali)).body.data;
    // One day recorded in 2026-27, and Ali was absent for it.
    expect(card.attendance.total).toBe(1);
    expect(card.attendance.absent).toBe(1);
  });

  it("shows only this year's fees", async () => {
    if (skip()) return;
    const card = (await report(ali)).body.data;
    expect(card.fees).toHaveLength(1);
    expect(card.fees[0].period).toBe("2026-05");
  });
});

describe("last year's card, still reachable", () => {
  it("is asked for by name and comes back complete", async () => {
    if (skip()) return;
    const res = await report(ali, "2025-26");
    expect(res.status).toBe(200);
    expect(res.body.data.session.name).toBe("2025-26");
    expect(res.body.data.session.isCurrent).toBe(false);
  });

  it("carries last year's marks, untouched by anything since", async () => {
    if (skip()) return;
    const card = (await report(ali, "2025-26")).body.data;
    expect(card.subjects.filter((s) => s.name === "Mathematics")).toHaveLength(1);
    expect(subjectNamed(card, "Mathematics").score).toBe(90);
    expect(card.average).toBe(90);
  });

  it("carries last year's attendance and last year's fees", async () => {
    if (skip()) return;
    const card = (await report(ali, "2025-26")).body.data;
    expect(card.attendance.total).toBe(1);
    expect(card.attendance.present).toBe(1);
    expect(card.fees).toHaveLength(1);
    expect(card.fees[0].period).toBe("2025-11");
  });

  /**
   * The card's own header. A past card that printed the student's *current*
   * class would be worse than no card: it would say a Grade 9 student sat the
   * Grade 8 exam this year.
   */
  it("names the subject of the year it reports", async () => {
    if (skip()) return;
    const card = (await report(ali, "2025-26")).body.data;
    const maths = subjectNamed(card, "Mathematics");
    expect(maths.assessments.map((a) => a.title)).toEqual(["Grade 8 Final"]);
  });
});

describe("position, worked out within one year", () => {
  it("ranks this year on this year's marks", async () => {
    if (skip()) return;
    // Grade 9: Sana 95, Ali 55.
    expect((await report(sana)).body.data.rank).toBe(1);
    expect((await report(ali)).body.data.rank).toBe(2);
  });

  it("ranks last year on last year's marks, the other way round", async () => {
    if (skip()) return;
    // Grade 8: Ali 90, Sana 60.
    expect((await report(ali, "2025-26")).body.data.rank).toBe(1);
    expect((await report(sana, "2025-26")).body.data.rank).toBe(2);
  });
});

/**
 * Every other screen that shows a student's work.
 *
 * The result card takes `?session=`; these do not — they are about what the
 * school is doing now. What matters is that none of them quietly carry last
 * year's enrolments alongside this year's, which is what they all did before.
 */
describe("the rest of the product shows this year only", () => {
  it("gives the student list this year's subjects", async () => {
    if (skip()) return;
    const row = (await as(admin).get("/api/students?limit=50")).body.data
      .find((s) => s.id === ali);

    expect(row.grade).toBe("Grade 9");
    expect(row.subjects.filter((s) => s.name === "Mathematics")).toHaveLength(1);
    expect(row.subjects.find((s) => s.name === "Mathematics").score).toBe(55);
  });

  it("gives the student's own page this year's subjects", async () => {
    if (skip()) return;
    const detail = (await as(admin).get(`/api/students/${ali}`)).body.data;
    expect(detail.subjects).toHaveLength(1);
    expect(detail.subjects[0].score).toBe(55);
  });

  it("ranks the student list within this year", async () => {
    if (skip()) return;
    const rows = (await as(admin).get("/api/students?limit=50")).body.data;
    const forSana = rows.find((s) => s.id === sana);
    const forAli = rows.find((s) => s.id === ali);
    // Grade 9: Sana 95, Ali 55 — the reverse of last year.
    expect(forSana.rank).toBe(1);
    expect(forAli.rank).toBe(2);
  });

  it("gives the gradebook this year's roster, once each", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/assessments/gradebook?subjectId=${mathsNine}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(2);
    expect(new Set(res.body.data.rows.map((r) => r.student.id)).size).toBe(2);
  });

  it("counts the subject roster for this year", async () => {
    if (skip()) return;
    const subjects = (await as(admin).get("/api/subjects?limit=50")).body.data;
    // Last year's Mathematics kept its two students; this year's has its own.
    expect(subjects.find((s) => s.id === mathsEight).studentCount).toBe(2);
    expect(subjects.find((s) => s.id === mathsNine).studentCount).toBe(2);
  });

  /**
   * Recording a mark says which year it is for. Last year's enrolment is not
   * reachable from this year's gradebook, which is what stops a correction to
   * an old result being filed against the new class.
   */
  it("refuses a mark for a subject the student no longer takes", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/assessments").send({
      studentId: ali, subjectId: mathsEight, title: "Late entry",
      type: "TEST", obtained: 70, total: 100,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/2026-27/);
  });

  it("still accepts one for last year when the year is named", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/assessments").send({
      studentId: ali, subjectId: mathsEight, session: "2025-26",
      title: "Re-check", type: "TEST", obtained: 88, total: 100, takenOn: "2025-12-01",
    });
    expect(res.status).toBe(201);

    // It lands on last year's card, and this year's is untouched.
    const last = (await report(ali, "2025-26")).body.data;
    expect(subjectNamed(last, "Mathematics").assessments).toHaveLength(2);
    expect((await report(ali)).body.data.subjects[0].score).toBe(55);
  });
});

describe("asking for a year the school never had", () => {
  it("says so rather than returning an empty card", async () => {
    if (skip()) return;
    const res = await report(ali, "2019-20");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/2025-26|2026-27/);
  });
});

describe("what the promotion actually moved", () => {
  it("left last year's enrolment where it was", async () => {
    if (skip()) return;
    const rows = await prismaRaw.enrollment.findMany({
      where: { studentId: ali },
      include: { subject: { select: { grade: true } }, academicSession: { select: { name: true } } },
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => `${r.subject.grade}/${r.academicSession.name}`).sort())
      .toEqual(["Grade 8/2025-26", "Grade 9/2026-27"]);
  });

  it("recorded the move itself", async () => {
    if (skip()) return;
    const moves = await prismaRaw.studentPromotion.findMany({ where: { studentId: ali } });
    expect(moves).toHaveLength(1);
    expect(moves[0].fromGrade).toBe("Grade 8");
    expect(moves[0].toGrade).toBe("Grade 9");
    expect(moves[0].fromSession).toBe("2025-26");
    expect(moves[0].toSession).toBe("2026-27");
  });
});
