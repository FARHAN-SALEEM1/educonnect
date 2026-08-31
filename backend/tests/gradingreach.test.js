import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Whether a school's grading policy actually reaches the product.
 *
 * `gradingpolicy.test.js` proves a school can set its own bands and that the
 * result card obeys them. That was the whole of it: the card was the only
 * screen that ever asked. The student list, the admin and parent dashboards,
 * the teacher's class list, the gradebook and the letter stored on every
 * enrolment all read a second band table that lived in `utils/academics.js` —
 * so a school that moved A+ down to 80 saw A+ on one printed document and A−
 * on every screen its staff and parents actually use.
 *
 * That is a settings screen that lies. The bug is not visible from any single
 * endpoint's tests, which is why it survived: each one agreed with itself.
 * These tests set one deliberately unusual policy and then ask every surface
 * the same question.
 *
 * A throwaway school, erased through the application's lifecycle in afterAll.
 */

let sa, admin, teacher, parent, instId, seeded = true;
let studentId, subjectId;
const made = [];
const stamp = Date.now();
const PASSWORD = "ReachSpec!2026";

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

/**
 * One band, one letter, and it starts at 10.
 *
 * Chosen so no accidental fallback can produce it: 72% is B on the platform's
 * board scale and A− on the ten-band scale that used to live in academics.js.
 * Anything reporting "TOP" for this student is genuinely reading the school's
 * own policy; anything reporting a letter from either default is not.
 */
const ODD_POLICY = {
  bands: [
    { min: 10, letter: "TOP", point: 5 },
    { min: 0, letter: "LOW", point: 0 },
  ],
  passingPercentage: 10,
};

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `reach.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Reach School ${stamp}`, city: "Multan", phone: "03001234567",
    email: `reach.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Reach Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  made.push(instId);
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await tokenFor(adminEmail, PASSWORD);
  if (!admin) { seeded = false; return; }

  const teacherEmail = `reach.t.${stamp}@test.edu`;
  const t = await as(admin).post("/api/teachers").send({
    name: "Reach Teacher", email: teacherEmail, phone: "03001111111",
    subject: "Mathematics", createLogin: true, password: PASSWORD,
  });
  if (t.status === 201) teacher = await tokenFor(teacherEmail, PASSWORD);

  studentId = (await as(admin).post("/api/students").send({
    name: "Reach Child", grade: "Grade 8", section: "A", rollNo: `RC-${stamp}`,
  })).body.data?.id;

  subjectId = (await as(admin).post("/api/subjects").send({
    name: "Mathematics", grade: "Grade 8", code: `RM-${stamp}`,
    ...(t.body.data?.id && { teacherId: t.body.data.id }),
  })).body.data?.id;
  if (!studentId || !subjectId) { seeded = false; return; }

  await as(admin).post("/api/subjects/enroll").send({ studentId, subjectId });

  // 72% — a mark both discarded default scales would letter differently.
  await as(admin).post("/api/assessments").send({
    studentId, subjectId, title: "Annual", type: "EXAM",
    obtained: 72, total: 100, takenOn: "2026-05-20",
  });

  const parentEmail = `reach.p.${stamp}@test.edu`;
  const p = await as(admin).post("/api/parents").send({
    name: "Reach Parent", email: parentEmail, relation: "Father",
    createLogin: true, password: PASSWORD, studentIds: [studentId],
  });
  if (p.status === 201) parent = await tokenFor(parentEmail, PASSWORD);

  await as(admin).patch("/api/institutes/me/grading").send(ODD_POLICY);
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

describe("the school's scale reaches every screen, not only the card", () => {
  it("the result card — which always obeyed", async () => {
    if (skip()) return;
    const d = (await as(admin).get(`/api/students/${studentId}/report`)).body.data;
    expect(d.overallGrade).toBe("TOP");
    expect(d.subjects[0].grade).toBe("TOP");
  });

  it("the student list", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/students?limit=50");
    const row = res.body.data.find((s) => s.id === studentId);
    expect(row.subjects[0].grade).toBe("TOP");
  });

  it("the student's own detail screen", async () => {
    if (skip()) return;
    const d = (await as(admin).get(`/api/students/${studentId}`)).body.data;
    expect(d.subjects[0].grade).toBe("TOP");
  });

  it("the gradebook a teacher marks in", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/assessments/gradebook?subjectId=${subjectId}`);
    const row = res.body.data.rows.find((r) => r.student.id === studentId);
    expect(row.letterGrade).toBe("TOP");
  });

  it("the subject screen", async () => {
    if (skip()) return;
    const d = (await as(admin).get(`/api/subjects/${subjectId}`)).body.data;
    const row = d.enrollments.find((e) => e.student.id === studentId);
    expect(row.letterGrade).toBe("TOP");
  });

  it("the teacher's own class list", async () => {
    if (skip() || !teacher) return;
    const res = await as(teacher).get("/api/teachers/me/classes");
    const rows = res.body.data.flatMap((c) => c.students ?? []);
    const row = rows.find((s) => s.id === studentId);
    if (!row) return; // the teacher owns no class holding this child
    expect(row.letterGrade).toBe("TOP");
  });

  it("the parent's dashboard", async () => {
    if (skip() || !parent) return;
    const d = (await as(parent).get("/api/dashboard/parent")).body.data;
    const child = d.children.find((s) => s.id === studentId);
    expect(child.subjects[0].grade).toBe("TOP");
  });
});

describe("changing the policy takes effect at once", () => {
  /**
   * `Enrollment.letterGrade` is a cache written when marks were last
   * recalculated. Every screen used to read that cache, so a school changing
   * its scale saw nothing move until each subject happened to be marked again.
   * The screens compute from the live policy now; the cache is still written,
   * but nothing displays it.
   */
  it("without waiting for anything to be re-marked", async () => {
    if (skip()) return;
    await as(admin).patch("/api/institutes/me/grading").send({
      bands: [{ min: 0, letter: "ZZZ", point: 1 }],
    });

    const list = await as(admin).get("/api/students?limit=50");
    expect(list.body.data.find((s) => s.id === studentId).subjects[0].grade).toBe("ZZZ");

    const card = (await as(admin).get(`/api/students/${studentId}/report`)).body.data;
    expect(card.subjects[0].grade).toBe("ZZZ");

    // Put the odd policy back for anything that runs after this.
    await as(admin).patch("/api/institutes/me/grading").send(ODD_POLICY);
  });

  it("and says how many stored letters are now behind", async () => {
    if (skip()) return;
    const res = await as(admin).patch("/api/institutes/me/grading").send({ passingPercentage: 40 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("cachedGradesToRefresh");
    expect(res.body.data.passingPercentage).toBe(40);

    await as(admin).patch("/api/institutes/me/grading").send(ODD_POLICY);
  });
});

describe("one school's policy is not another's", () => {
  it("leaves a second school on the platform default", async () => {
    if (skip()) return;
    const otherEmail = `reach.other.${stamp}@test.edu`;
    const other = await request(app).post("/api/auth/signup").send({
      name: `Reach Other ${stamp}`, city: "Quetta", phone: "03001234567",
      email: `reach.otherschool.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
      adminName: "Other Admin", adminEmail: otherEmail, adminPassword: PASSWORD,
    });
    const otherId = other.body.data?.institute?.id;
    if (!otherId) return;
    made.push(otherId);
    await as(sa).patch(`/api/institutes/${otherId}/status`).send({ status: "ACTIVE" });
    const otherAdmin = await tokenFor(otherEmail, PASSWORD);

    const res = await as(otherAdmin).get("/api/institutes/me/grading");
    expect(res.body.data.isDefault).toBe(true);
    expect(res.body.data.bands.map((b) => b.letter)).not.toContain("TOP");
  });
});
