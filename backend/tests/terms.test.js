import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Exam terms.
 *
 * A Pakistani school reports per term, not per year: a result card says "First
 * Term" and carries only that term's marks. `Assessment.term` is nullable
 * because every mark recorded before terms existed belongs to no term, and
 * guessing one for them would invent history — so those marks appear on the
 * full-year card and on no term's.
 *
 * Everything here happens inside a throwaway school, deleted in afterAll.
 */

let sa, admin, instId, seeded = true;
let subjectId, alia, bilal;
const stamp = Date.now();

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

const card = async (studentId, term) =>
  (await as(admin).get(`/api/students/${studentId}/report${term ? `?term=${term}` : ""}`)).body.data;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `terms.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Terms School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `terms.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Terms Admin", adminEmail, adminPassword: "TermsSpec123",
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await login(adminEmail, "TermsSpec123");

  const teacher = await as(admin).post("/api/teachers").send({
    name: "Terms Teacher", email: `terms.t.${stamp}@test.edu`,
    phone: "03001111111", subject: "Mathematics",
  });

  const mk = async (name, roll) => (await as(admin).post("/api/students").send({
    name, grade: "Grade 8", section: "A", rollNo: roll,
  })).body.data.id;
  alia = await mk("Terms Alia", `TRM-A-${stamp}`);
  bilal = await mk("Terms Bilal", `TRM-B-${stamp}`);

  const subject = await as(admin).post("/api/subjects").send({
    name: "Mathematics", grade: "Grade 8", teacherId: teacher.body.data.id, code: `TRM-${stamp}`,
  });
  subjectId = subject.body.data.id;
  for (const id of [alia, bilal]) await as(admin).post("/api/subjects/enroll").send({ studentId: id, subjectId });

  // Alia is stronger in the first term, Bilal in the mid — so the position must swap.
  const mark = (studentId, term, obtained, title) =>
    as(admin).post("/api/assessments").send({
      studentId, subjectId, title, type: "EXAM", term, obtained, total: 100,
    });
  await mark(alia, "First Term", 90, "First Term Exam");
  await mark(bilal, "First Term", 60, "First Term Exam");
  await mark(alia, "Mid Term", 50, "Mid Term Exam");
  await mark(bilal, "Mid Term", 85, "Mid Term Exam");
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

describe("recording a mark against a term", () => {
  it("keeps the term on the mark", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/assessments?subjectId=${subjectId}&term=First%20Term&limit=50`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((a) => a.term === "First Term")).toBe(true);
  });

  it("refuses a term the school does not have, and says which it has", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/assessments").send({
      studentId: alia, subjectId, title: "Summer", type: "EXAM",
      term: "Summer Term", obtained: 10, total: 100,
    });
    // A lookup miss, not a schema violation — which is what lets the message
    // name the terms this school actually has instead of listing an enum.
    expect(res.status).toBe(404);
    expect(res.body.message).toContain("First Term");
  });

  it("matches a term name however it is cased", async () => {
    if (skip()) return;
    const res = await as(admin).get(
      `/api/assessments?subjectId=${subjectId}&term=first%20term&limit=50`
    );
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it("lets a mark belong to no term at all", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/assessments").send({
      studentId: alia, subjectId, title: "Class Test", type: "QUIZ", obtained: 8, total: 10,
    });
    expect(res.status).toBe(201);
    const row = await prismaRaw.assessment.findUnique({ where: { id: res.body.data.id } });
    // `term` is no longer a column — the mark points at a term row, or at none.
    expect(row.examTermId).toBeNull();

    // Removed through the API, not the table: deleting the row directly leaves
    // `currentScore` holding an average that includes a mark no longer there,
    // and a later assertion in this file would read it.
    expect((await as(admin).delete(`/api/assessments/${res.body.data.id}`)).status).toBe(200);
  });
});

describe("a term result card", () => {
  it("reports only that term's marks", async () => {
    if (skip()) return;
    const first = await card(alia, "First Term");
    expect(first.term).toBe("First Term");
    expect(first.average).toBe(90);
    expect(first.subjects[0].score).toBe(90);
    expect(first.subjects[0].assessmentCount).toBe(1);

    const mid = await card(alia, "Mid Term");
    expect(mid.average).toBe(50);
    expect(mid.subjects[0].score).toBe(50);
  });

  it("ranks the class on that term, so the position can change between terms", async () => {
    if (skip()) return;
    const aFirst = await card(alia, "First Term");
    const bFirst = await card(bilal, "First Term");
    expect([aFirst.rank, aFirst.classSize]).toEqual([1, 2]);
    expect([bFirst.rank, bFirst.classSize]).toEqual([2, 2]);

    // Bilal outscored Alia in the mid term, so he takes first place there.
    const aMid = await card(alia, "Mid Term");
    const bMid = await card(bilal, "Mid Term");
    expect([bMid.rank, bMid.classSize]).toEqual([1, 2]);
    expect([aMid.rank, aMid.classSize]).toEqual([2, 2]);
  });

  it("grades the term average on the shared bands", async () => {
    if (skip()) return;
    const mid = await card(alia, "Mid Term");
    expect(mid.overallGrade).toBe("C"); // 50, on the board scale
    expect(mid.subjects[0].grade).toBe("C");
  });

  /**
   * A term nobody has marked yet is not a term of zeroes. `averageScore`
   * answers 0 for an empty set and `letterGrade(0)` is F, so a card printed
   * before the exams would have handed every parent 0% and an F — and a
   * position, ranked among a class where everyone scored the same nothing.
   */
  it("reports nothing at all for a term with no marks", async () => {
    if (skip()) return;
    const final = await card(alia, "Final Term");
    expect(final.average).toBeNull();
    expect(final.overallGrade).toBeNull();
    expect(final.rank).toBeNull();
    // the class is still a real size, and the subject says why it is empty
    expect(final.classSize).toBe(2);
    expect(final.subjects[0].assessmentCount).toBe(0);
  });

  it("behaves exactly as before when no term is asked for", async () => {
    if (skip()) return;
    const year = await card(alia, null);
    expect(year.term).toBeNull();
    expect(year.average).toBe(70); // (90 + 50) / 2
    expect(year.subjects[0].assessmentCount).toBe(2);
    expect(year.rank).not.toBeNull();
  });
});

describe("the gradebook follows the same term", () => {
  it("shows one term's columns when asked", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/assessments/gradebook?subjectId=${subjectId}&term=First%20Term`);
    expect(res.status).toBe(200);
    // A column is a sitting now, not a bare title — same one paper, more of
    // its identity carried alongside so two papers named alike stay apart.
    expect(res.body.data.columns.map((c) => c.title)).toEqual(["First Term Exam"]);
    expect(res.body.data.columns[0].term).toBe("First Term");
  });

  it("averages that term too, not the whole year beside it", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/assessments/gradebook?subjectId=${subjectId}&term=Mid%20Term`);
    const row = res.body.data.rows.find((r) => r.student.id === bilal);
    expect(row.average).toBe(85); // his mid mark, not his 72.5 year average
    expect(row.letterGrade).toBe("A+");
  });

  it("still shows the whole year unfiltered", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/assessments/gradebook?subjectId=${subjectId}`);
    expect(res.body.data.columns.length).toBe(2);
    const row = res.body.data.rows.find((r) => r.student.id === bilal);
    expect(row.average).toBe(72.5); // (60 + 85) / 2
  });
});
