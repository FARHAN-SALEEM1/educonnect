import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * A column in the gradebook is a sitting, not a title.
 *
 * Teachers reuse titles. "quiz" in September and "quiz" in October are two
 * different papers, and a book that keys its columns on the title alone shows
 * one of them and silently drops the other — while both still count towards
 * the average printed at the end of the row.
 *
 * That is what this file exists to stop. Found by reading a real gradebook and
 * noticing that 12/20 and 18/20 do not average to 82%: the third mark was
 * there, in the arithmetic, and nowhere on the screen.
 *
 * One throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "ColumnSpec123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
});

let sa, admin, instId, subjectId;
const students = [];
let seeded = true;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `columns.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Column School ${stamp}`,
    city: "Karachi",
    phone: "03001234567",
    email: `columns.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "Column Admin",
    adminEmail,
    adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) {
    seeded = false;
    return;
  }
  await request(app)
    .patch(`/api/institutes/${instId}/status`)
    .set("Authorization", `Bearer ${sa}`)
    .send({ status: "ACTIVE" });
  admin = await login(adminEmail);
  if (!admin) {
    seeded = false;
    return;
  }

  const subject = await as(admin)
    .post("/api/subjects")
    .send({ name: "Mathematics", grade: "Grade 8", code: `MTH${stamp % 10000}` });
  subjectId = subject.body.data?.id;

  for (const n of [1, 2]) {
    const s = await as(admin)
      .post("/api/students")
      .send({
        name: `Column Child ${n}`,
        grade: "Grade 8",
        section: "A",
        rollNo: `COL-${n}-${stamp}`,
        subjectIds: subjectId ? [subjectId] : undefined,
      });
    if (s.body.data?.id) students.push(s.body.data.id);
  }
  if (!subjectId || students.length !== 2) seeded = false;
}, 90_000);

afterAll(async () => {
  if (instId) await prismaRaw.institute.delete({ where: { id: instId } }).catch(() => {});
  await prismaRaw.user
    .deleteMany({ where: { email: { contains: `.${stamp}@test.edu` } } })
    .catch(() => {});
});

const skip = () => !seeded;

it("built its fixtures", async () => {
  const { seedPresent } = await import("./helpers/fixtures.js");
  if (!(await seedPresent())) return;
  expect(seeded, "beforeAll did not complete — every test in this file is vacuous").toBe(true);
});

/** One batch of marks, the way the mark-entry screen sends them. */
const record = (title, takenOn, marks) =>
  as(admin)
    .post("/api/assessments/bulk")
    .send({
      subjectId,
      title,
      type: "QUIZ",
      total: 20,
      takenOn,
      results: students.map((id, i) => ({ studentId: id, obtained: marks[i] })),
    });

const book = async () =>
  (await as(admin).get(`/api/assessments/gradebook?subjectId=${subjectId}`)).body.data;

describe("admitting a child into their subjects", () => {
  /**
   * The fixtures above depend on this, and it was broken.
   *
   * An enrolment belongs to an academic year, and the nested create inside
   * `POST /students` never named one — so any admission that listed a subject
   * failed on the database, and the admin was told "Invalid data sent to the
   * database" about a field the API accepts and documents. Nothing in the
   * product sent it, which is why nothing caught it.
   */
  it("enrols them, rather than refusing the admission", async () => {
    if (skip()) return;
    const res = await as(admin)
      .post("/api/students")
      .send({
        name: "Admitted With Subjects",
        grade: "Grade 8",
        section: "A",
        rollNo: `ADM-${stamp}`,
        subjectIds: [subjectId],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.enrollments).toHaveLength(1);
  });

  it("puts the enrolment in the year that is running", async () => {
    if (skip()) return;
    const rows = await prismaRaw.enrollment.findMany({
      where: { student: { rollNo: `ADM-${stamp}` } },
      select: { academicSessionId: true },
    });

    expect(rows).toHaveLength(1);
    const session = await prismaRaw.academicSession.findFirst({
      where: { instituteId: instId, isCurrent: true },
      select: { id: true },
    });
    expect(rows[0].academicSessionId, "a session-scoped list would not see it otherwise").toBe(
      session.id
    );
  });
});

describe("two papers with the same name", () => {
  it("takes both", async () => {
    if (skip()) return;
    expect((await record("quiz", "2026-08-03", [12, 17])).status).toBe(201);
    expect((await record("quiz", "2026-08-17", [19, 20])).status).toBe(201);
  });

  it("gives each its own column", async () => {
    if (skip()) return;
    const b = await book();

    expect(b.columns, "one column per sitting, not per title").toHaveLength(2);
    expect(new Set(b.columns.map((c) => c.key)).size).toBe(2);
  });

  it("shows every mark it counted", async () => {
    if (skip()) return;
    const b = await book();
    const row = b.rows.find((r) => r.student.rollNo === `COL-1-${stamp}`);

    const shown = b.columns.map((c) => row.marks[c.key]).filter(Boolean);
    expect(shown.map((m) => m.obtained), "12 and 19, in the order they were sat").toEqual([12, 19]);
  });

  it("prints an average the marks on screen add up to", async () => {
    if (skip()) return;
    const b = await book();
    const row = b.rows.find((r) => r.student.rollNo === `COL-1-${stamp}`);

    const shown = b.columns.map((c) => row.marks[c.key]).filter(Boolean);
    const fromScreen =
      shown.reduce((s, m) => s + (m.obtained / m.total) * 100, 0) / shown.length;

    // 60% and 95% — a teacher reading the row can get to this number.
    expect(Number(fromScreen.toFixed(1))).toBe(77.5);
    expect(row.marksAverage, "and it is the one the API reports").toBe(77.5);
  });

  it("names the columns so a teacher can tell them apart", async () => {
    if (skip()) return;
    const b = await book();
    const labels = b.columns.map((c) => c.label);

    expect(new Set(labels).size, "two columns called 'quiz' would be unreadable").toBe(2);
    expect(labels.every((l) => l.startsWith("quiz"))).toBe(true);
  });

  it("leaves an unambiguous title alone", async () => {
    if (skip()) return;
    expect((await record("Mid Term", "2026-08-24", [15, 16])).status).toBe(201);
    const b = await book();

    const midterm = b.columns.filter((c) => c.title === "Mid Term");
    expect(midterm).toHaveLength(1);
    expect(midterm[0].label, "nothing to disambiguate, so no date is added").toBe("Mid Term");
  });

  it("reads left to right in the order they were sat", async () => {
    if (skip()) return;
    const b = await book();
    const dates = b.columns.map((c) => c.takenOn);

    expect(dates).toEqual([...dates].sort());
  });
});
