import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * What promotion actually creates.
 *
 * Moving a class used to change `Student.grade` and write a history row, and
 * stop. The students arrived in Grade 9 still holding their Grade 8 enrolments
 * and nothing else — so the new year had no subjects until somebody enrolled
 * every child by hand, and the old year's marks were the only marks there were.
 *
 * The new year's subjects come from the **destination class**, not from what the
 * student took last year. `Subject` is already per-grade, so "Grade 9" is a
 * curriculum; reading it means a Grade 8 subject cannot follow a child upward by
 * accident. A retained student repeats a year, so their destination is the grade
 * they are already in — one rule, not two.
 *
 * Throwaway schools, erased through the application's lifecycle in afterAll.
 */

let sa, admin, instId, seeded = true;
let promoted, retained, graduating;
let maths8, urdu8, maths9, bio9;
const made = [];
const stamp = Date.now();
const PASSWORD = "PromoEnrol!2026";

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

const student = (name, grade, section, n) =>
  as(admin).post("/api/students").send({ name, grade, section, rollNo: `PE-${n}-${stamp}` })
    .then((r) => r.body.data?.id);

const subject = (name, grade, n) =>
  as(admin).post("/api/subjects").send({ name, grade, code: `PE${n}-${stamp}` })
    .then((r) => r.body.data?.id);

/** Every enrolment a student holds, with its subject and year. */
const enrolmentsOf = (studentId) =>
  prismaRaw.enrollment.findMany({
    where: { studentId },
    include: {
      subject: { select: { name: true, grade: true } },
      academicSession: { select: { name: true } },
      assessments: { select: { id: true } },
    },
    orderBy: { subject: { name: "asc" } },
  });

const promote = (body) => as(admin).post("/api/students/promote").send(body);

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `promoenrol.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Promotion Enrolment School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `promoenrol.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Promo Enrol Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  made.push(instId);
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await tokenFor(adminEmail, PASSWORD);
  if (!admin) { seeded = false; return; }

  // Grade 8 curriculum, and Grade 9's — deliberately different subjects.
  maths8 = await subject("Mathematics", "Grade 8", "M8");
  urdu8 = await subject("Urdu", "Grade 8", "U8");
  maths9 = await subject("Mathematics", "Grade 9", "M9");
  bio9 = await subject("Biology", "Grade 9", "B9");

  promoted = await student("Promoted Child", "Grade 8", "A", 1);
  retained = await student("Retained Child", "Grade 8", "A", 2);
  graduating = await student("Graduating Child", "Grade 10", "A", 3);
  if (!maths8 || !urdu8 || !maths9 || !bio9 || !promoted || !retained || !graduating) {
    seeded = false;
    return;
  }

  // Grade 8, this year: both children take the Grade 8 curriculum and are marked.
  for (const id of [promoted, retained]) {
    for (const sub of [maths8, urdu8]) {
      await as(admin).post("/api/subjects/enroll").send({ studentId: id, subjectId: sub });
    }
  }
  await as(admin).post("/api/assessments").send({
    studentId: promoted, subjectId: maths8, title: "Grade 8 Final",
    type: "EXAM", obtained: 88, total: 100, takenOn: "2026-05-20",
  });
  await as(admin).post("/api/assessments").send({
    studentId: retained, subjectId: maths8, title: "Grade 8 Final",
    type: "EXAM", obtained: 31, total: 100, takenOn: "2026-05-20",
  });
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

describe("before anything moves", () => {
  it("shows what the dry run will create, without creating it", async () => {
    if (skip()) return;
    const before = await prismaRaw.enrollment.count({ where: { studentId: promoted } });

    const res = await promote({
      fromGrade: "Grade 8", fromSection: "A", toGrade: "Grade 9", toSection: "A",
      toSession: "2027-28", outcome: "PROMOTED", studentIds: [promoted], dryRun: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.curriculum.sort()).toEqual(["Biology", "Mathematics"]);
    expect(res.body.data.enrolmentsToCreate).toBe(2);
    expect(res.body.message).toContain("Biology");

    expect(await prismaRaw.enrollment.count({ where: { studentId: promoted } })).toBe(before);
  });
});

describe("a promoted student", () => {
  it("is enrolled in the destination class's curriculum, not last year's", async () => {
    if (skip()) return;
    const res = await promote({
      fromGrade: "Grade 8", fromSection: "A", toGrade: "Grade 9", toSection: "A",
      toSession: "2027-28", outcome: "PROMOTED", studentIds: [promoted],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.enrolmentsCreated).toBe(2);

    const rows = await enrolmentsOf(promoted);
    const next = rows.filter((r) => r.academicSession.name === "2027-28");

    expect(next.map((r) => r.subject.name).sort()).toEqual(["Biology", "Mathematics"]);
    // Grade 8 Urdu did not follow them up. That is the whole point of reading
    // the curriculum rather than copying what they took.
    expect(next.every((r) => r.subject.grade === "Grade 9")).toBe(true);
  });

  it("keeps last year's enrolments and last year's marks", async () => {
    if (skip()) return;
    const last = (await enrolmentsOf(promoted)).filter((r) => r.academicSession.name === "2026-27");

    expect(last.map((r) => r.subject.name).sort()).toEqual(["Mathematics", "Urdu"]);
    expect(last.find((r) => r.subject.name === "Mathematics").assessments).toHaveLength(1);
    expect(last.find((r) => r.subject.name === "Mathematics").currentScore).toBe(88);
  });

  it("starts the new year with no marks at all", async () => {
    if (skip()) return;
    const next = (await enrolmentsOf(promoted)).filter((r) => r.academicSession.name === "2027-28");
    expect(next.every((r) => r.assessments.length === 0)).toBe(true);
    expect(next.every((r) => r.currentScore === null)).toBe(true);
  });

  /**
   * Mathematics exists in both years as two different `Subject` rows — one per
   * grade — so this holds today. It has to keep holding once a school reuses
   * one subject row across years, which is what the session in the unique key
   * is for.
   */
  it("holds the same subject name in both years at once", async () => {
    if (skip()) return;
    const maths = (await enrolmentsOf(promoted)).filter((r) => r.subject.name === "Mathematics");
    expect(maths).toHaveLength(2);
    expect(maths.map((r) => r.academicSession.name).sort()).toEqual(["2026-27", "2027-28"]);
  });

  it("moved class, and the move is on the record", async () => {
    if (skip()) return;
    const row = await prismaRaw.student.findUnique({
      where: { id: promoted }, select: { grade: true, section: true, status: true },
    });
    expect(row.grade).toBe("Grade 9");
    expect(row.status).toBe("ACTIVE");

    const moves = await prismaRaw.studentPromotion.findMany({ where: { studentId: promoted } });
    expect(moves).toHaveLength(1);
    expect(moves[0].outcome).toBe("PROMOTED");
  });
});

describe("a retained student", () => {
  it("stays in the same class but gets that class's curriculum for the new year", async () => {
    if (skip()) return;
    const res = await promote({
      fromGrade: "Grade 8", fromSection: "A", toGrade: "Grade 8", toSection: "A",
      toSession: "2027-28", outcome: "RETAINED", studentIds: [retained],
    });
    expect(res.status).toBe(200);

    const row = await prismaRaw.student.findUnique({
      where: { id: retained }, select: { grade: true, section: true },
    });
    expect(row.grade).toBe("Grade 8");
    expect(row.section).toBe("A");

    const next = (await enrolmentsOf(retained)).filter((r) => r.academicSession.name === "2027-28");
    expect(next.map((r) => r.subject.name).sort()).toEqual(["Mathematics", "Urdu"]);
  });

  it("repeats the year with a clean slate, last year's marks intact", async () => {
    if (skip()) return;
    const rows = await enrolmentsOf(retained);
    const last = rows.filter((r) => r.academicSession.name === "2026-27");
    const next = rows.filter((r) => r.academicSession.name === "2027-28");

    // The 31% that held them back is still on last year's record.
    expect(last.find((r) => r.subject.name === "Mathematics").currentScore).toBe(31);
    expect(next.every((r) => r.currentScore === null && r.assessments.length === 0)).toBe(true);
  });

  /**
   * The same subject row, twice, in two years — a repeating student takes the
   * identical `Subject` record again. This is the case the old
   * `@@unique([studentId, subjectId])` made impossible.
   */
  it("takes the very same subject row in both years", async () => {
    if (skip()) return;
    const maths = (await enrolmentsOf(retained)).filter((r) => r.subject.name === "Mathematics");
    expect(maths).toHaveLength(2);
    expect(new Set(maths.map((r) => r.subjectId)).size).toBe(1);
    expect(maths.map((r) => r.academicSession.name).sort()).toEqual(["2026-27", "2027-28"]);
  });
});

describe("a graduating student", () => {
  it("is enrolled in nothing new", async () => {
    if (skip()) return;
    const before = await prismaRaw.enrollment.count({ where: { studentId: graduating } });

    const res = await promote({
      fromGrade: "Grade 10", fromSection: "A",
      toSession: "2027-28", outcome: "GRADUATED", studentIds: [graduating],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.enrolmentsCreated).toBe(0);
    expect(res.body.data.curriculum).toEqual([]);

    expect(await prismaRaw.enrollment.count({ where: { studentId: graduating } })).toBe(before);
  });

  it("leaves the school, and stays on the record", async () => {
    if (skip()) return;
    const row = await prismaRaw.student.findUnique({
      where: { id: graduating }, select: { status: true, grade: true },
    });
    expect(row.status).toBe("GRADUATED");
    // Still Grade 10 — graduating is not a move to another class.
    expect(row.grade).toBe("Grade 10");

    const moves = await prismaRaw.studentPromotion.findMany({ where: { studentId: graduating } });
    expect(moves[0].toGrade).toBeNull();
  });
});

describe("running it twice", () => {
  it("does not enrol anybody a second time", async () => {
    if (skip()) return;
    const before = await prismaRaw.enrollment.count({ where: { studentId: promoted } });

    await promote({
      fromGrade: "Grade 9", fromSection: "A", toGrade: "Grade 9", toSection: "A",
      toSession: "2027-28", outcome: "RETAINED", studentIds: [promoted],
    });

    expect(await prismaRaw.enrollment.count({ where: { studentId: promoted } })).toBe(before);
  });
});

describe("a class with nowhere to go", () => {
  it("says the destination has no subjects rather than silently doing nothing", async () => {
    if (skip()) return;
    const lonely = await student("Lonely Child", "Grade 11", "A", 9);
    if (!lonely) return;

    const res = await promote({
      fromGrade: "Grade 11", fromSection: "A", toGrade: "Grade 12", toSection: "A",
      toSession: "2027-28", outcome: "PROMOTED", studentIds: [lonely], dryRun: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.enrolmentsToCreate).toBe(0);
    expect(res.body.message).toMatch(/no subjects yet/i);
  });
});

describe("position, kept apart by year", () => {
  it("ranks each year on its own marks", async () => {
    if (skip()) return;
    // Two children in Grade 8 last year: 88 and 31.
    const promotedCard = (await as(admin).get(`/api/students/${promoted}/report?session=2026-27`)).body.data;
    const retainedCard = (await as(admin).get(`/api/students/${retained}/report?session=2026-27`)).body.data;

    expect(promotedCard.rank).toBe(1);
    expect(retainedCard.rank).toBe(2);

    // This year neither has been marked, so there is no position to report.
    const thisYear = (await as(admin).get(`/api/students/${retained}/report?session=2027-28`)).body.data;
    expect(thisYear.rank).toBeNull();
  });
});
