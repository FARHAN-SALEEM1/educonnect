import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { letterGrade } from "../src/utils/academics.js";

/**
 * The result card contract.
 *
 * `GET /students/:id/report` returns everything a Pakistani school prints on a
 * result card — school header, student and guardian details, every subject with
 * its teacher and marks, an attendance summary and the fee position. It was
 * built, tested at the controller level, and then had no caller at all for
 * months: the office had a complete result card on the server and no way to
 * look at one.
 *
 * The portals now render it, so the shape it returns is a contract rather than
 * an implementation detail. These pin the fields the card actually reads, and
 * who is allowed to ask for one.
 */

let admin, teacher, parent, lacasAdmin, seeded = true;
let studentId, otherInstituteStudentId;

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({ get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`) });

beforeAll(async () => {
  [admin, teacher, parent, lacasAdmin] = await Promise.all([
    login("admin@bhs.edu", "admin123"),
    login("hassan@bhs.edu", "teach123"),
    login("sara@gmail.com", "parent123"),
    login("admin@lacas.edu", "admin123"),
  ]);
  if (!admin || !parent) { seeded = false; return; }

  /**
   * The parent's own child, so the parent case is a real one — and one who has
   * actually been marked.
   *
   * This used to take `findFirst` with no `orderBy`. That guardian has more
   * than one child, so which one came back was whatever order the database
   * felt like, and on 2026-08-30 it changed: the spec picked a child with no
   * marks and no enrolments, and two tests failed for reasons that had nothing
   * to do with the code. Both failures were correct behaviour — an unmarked
   * child has no rank, and a teacher cannot open the report of a child they do
   * not teach — but this file is about ranking, so it needs a marked child,
   * chosen deterministically.
   */
  const parentUser = await prismaRaw.user.findFirst({ where: { email: "sara@gmail.com" }, select: { id: true } });
  const own = await prismaRaw.student.findFirst({
    where: {
      parent: { userId: parentUser?.id },
      deletedAt: null,
      enrollments: { some: { assessments: { some: {} } } },
    },
    orderBy: { rollNo: "asc" },
    select: { id: true },
  });
  studentId = own?.id;

  const lacas = await prismaRaw.institute.findFirst({ where: { name: "LACAS" }, select: { id: true } });
  otherInstituteStudentId = (await prismaRaw.student.findFirst({ where: { instituteId: lacas?.id }, select: { id: true } }))?.id;

  if (!studentId) seeded = false;
});

afterAll(async () => { /* read-only */ });

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

describe("the result card payload", () => {
  it("carries every section the card prints", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/students/${studentId}/report`);
    expect(res.status).toBe(200);
    const d = res.body.data;

    // school header
    expect(d.institute?.name).toBeTruthy();
    // who it is about
    expect(d.student?.name).toBeTruthy();
    expect(d.student?.code).toBeTruthy();
    expect(d.student).toHaveProperty("grade");
    expect(d.student).toHaveProperty("section");
    expect(d.student).toHaveProperty("rollNo");
    // the three figures at the top of the card
    expect(d).toHaveProperty("average");
    // subjects table
    expect(Array.isArray(d.subjects)).toBe(true);
    // attendance block
    expect(d.attendance).toBeTruthy();
    for (const key of ["present", "absent", "late", "leave", "total", "rate"]) {
      expect(d.attendance, `attendance.${key} missing`).toHaveProperty(key);
    }
    // fee position
    expect(Array.isArray(d.fees)).toBe(true);
    expect(d.generatedAt).toBeTruthy();
  });

  it("gives each subject the columns the table has", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/students/${studentId}/report`);
    const subjects = res.body.data.subjects;
    if (!subjects.length) return; // nothing enrolled is a valid state; the card says so

    for (const s of subjects) {
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("teacher");
      expect(s).toHaveProperty("score");
      expect(s).toHaveProperty("previousScore");
      expect(s).toHaveProperty("grade");
    }
  });

  it("counts a late arrival as attendance, once", async () => {
    if (skip()) return;
    const { attendance } = (await as(admin).get(`/api/students/${studentId}/report`)).body.data;
    const sum = attendance.present + attendance.absent + attendance.late + attendance.leave;
    expect(sum).toBe(attendance.total);

    if (attendance.total) {
      const expectedRate = Number((((attendance.present + attendance.late) / attendance.total) * 100).toFixed(1));
      expect(attendance.rate).toBe(expectedRate);
    }
  });

  it("does not leak the gateway identifiers through the institute header", async () => {
    if (skip()) return;
    const body = JSON.stringify((await as(admin).get(`/api/students/${studentId}/report`)).body);
    for (const key of ["providerCustomerId", "providerSubscriptionId", "providerPriceIds", "passwordHash"]) {
      expect(body).not.toContain(key);
    }
  });
});

/**
 * Position in class.
 *
 * A Pakistani result card leads with it. `classRank` was already written and
 * already used by `GET /students/:id` — the report endpoint simply never
 * carried it, so the printed card could not show the one figure every parent
 * looks for first. It is computed from the same query and the same helper on
 * purpose: two screens quoting a different position for one child would be
 * worse than quoting none at all.
 */
describe("position in class", () => {
  it("is on the report, with the size of the class", async () => {
    if (skip()) return;
    const d = (await as(admin).get(`/api/students/${studentId}/report`)).body.data;
    expect(d).toHaveProperty("rank");
    expect(d).toHaveProperty("classSize");
    expect(d.classSize).toBeGreaterThan(0);
    if (d.rank !== null) {
      expect(d.rank).toBeGreaterThanOrEqual(1);
      expect(d.rank).toBeLessThanOrEqual(d.classSize);
    }
  });

  it("agrees with the figure GET /students/:id already showed", async () => {
    if (skip()) return;
    const report = (await as(admin).get(`/api/students/${studentId}/report`)).body.data;
    const detail = (await as(admin).get(`/api/students/${studentId}`)).body.data;
    expect(report.rank).toBe(detail.rank);
    expect(report.classSize).toBe(detail.classSize);
  });

  it("ranks the whole class consistently — every place taken once, best average first", async () => {
    if (skip()) return;
    const me = await prismaRaw.student.findUnique({
      where: { id: studentId },
      select: { instituteId: true, grade: true, section: true },
    });
    /**
     * `deletedAt` is spelt out because this is `prismaRaw` — the unextended
     * client, used here on purpose to get ground truth rather than the API's
     * own answer. Without it the query counts children who have been removed:
     * a soft delete leaves `status` untouched, so a departed student is still
     * ACTIVE in the row. That is what happened on 2026-08-30 — a student was
     * removed from the seeded school through the UI, and this spec started
     * failing while the API was right all along: it asked for a report on a
     * child the API correctly 404s, and expected a class of six where five
     * remained.
     */
    const classmates = await prismaRaw.student.findMany({
      where: {
        instituteId: me.instituteId,
        grade: me.grade,
        section: me.section,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });

    const seen = [];
    for (const c of classmates) {
      const d = (await as(admin).get(`/api/students/${c.id}/report`)).body.data;
      seen.push({ rank: d.rank, average: d.average, classSize: d.classSize });
    }

    // everyone agrees how big the class is, ranked or not
    expect(seen.every((r) => r.classSize === classmates.length)).toBe(true);

    /**
     * A position needs a mark to stand on.
     *
     * A student with nothing recorded has no place in the order — `averageScore`
     * returns 0 for them, so ranking them would sort a child who has not sat
     * anything against children who have, and print "5th of 6" on a card with
     * no marks on it. They report no position at all, the same way an unmarked
     * term does.
     */
    const ranked = seen.filter((r) => r.rank !== null);
    const unranked = seen.filter((r) => r.rank === null);
    expect(unranked.every((r) => r.average === null)).toBe(true);
    expect(ranked.length).toBeGreaterThan(0);

    // Among those who have a position: 1..n, each place used exactly once.
    expect(ranked.map((r) => r.rank).sort((a, b) => a - b))
      .toEqual(ranked.map((_, i) => i + 1));

    // and the order actually follows the averages
    const byRank = [...ranked].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < byRank.length; i += 1) {
      expect(byRank[i - 1].average).toBeGreaterThanOrEqual(byRank[i].average);
    }
  });

  /**
   * One document, one grading scale.
   *
   * The card first worked the overall letter out in the browser from bands
   * invented there — A+ at 80 — while every subject letter came from the
   * server's ten bands, where 80 is A−. Zain at 84.8 read "A−" on his subjects
   * and "A+" underneath them. The server now sends the overall letter too, so
   * there is only one scale to disagree with.
   */
  it("grades the overall average on the same bands as the subjects", async () => {
    if (skip()) return;
    const d = (await as(admin).get(`/api/students/${studentId}/report`)).body.data;
    expect(d).toHaveProperty("overallGrade");
    expect(d.overallGrade).toBe(letterGrade(d.average));

    // and every subject letter comes from those bands too
    for (const s of d.subjects) {
      if (s.score === null || s.score === undefined) continue;
      expect(s.grade).toBe(letterGrade(s.score));
    }
  });

  /**
   * One scale for the whole product, not just this card.
   *
   * The card was the only screen that ever read the school’s own bands.
   * Everything else — the student list, both dashboards, the gradebook and
   * the letter stored on an enrolment — read a second table that lived in
   * utils/academics.js, so a school's own scale stopped at one document.
   * There is one table now, and this pins the platform default it falls
   * back to.
   */
  it("falls back to the board scale, whose floor is the pass mark", () => {
    expect(letterGrade(80)).toBe("A+");
    expect(letterGrade(70)).toBe("A");
    expect(letterGrade(60)).toBe("B");
    expect(letterGrade(50)).toBe("C");
    expect(letterGrade(40)).toBe("D");
    expect(letterGrade(33)).toBe("E");
    expect(letterGrade(32)).toBe("F");
  });

  it("counts only the child's own class, not the whole school", async () => {
    if (skip()) return;
    const d = (await as(parent).get(`/api/students/${studentId}/report`)).body.data;
    const me = await prismaRaw.student.findUnique({
      where: { id: studentId },
      select: { instituteId: true, grade: true, section: true },
    });
    // Same reason as above: raw client, so the soft-delete filter is explicit.
    const inClass = await prismaRaw.student.count({
      where: {
        instituteId: me.instituteId,
        grade: me.grade,
        section: me.section,
        status: "ACTIVE",
        deletedAt: null,
      },
    });
    const inSchool = await prismaRaw.student.count({
      where: { instituteId: me.instituteId, status: "ACTIVE", deletedAt: null },
    });

    expect(d.classSize).toBe(inClass);
    if (inSchool > inClass) expect(d.classSize).toBeLessThan(inSchool);
  });
});

describe("who may ask for a result card", () => {
  it("lets the institute's admin", async () => {
    if (skip()) return;
    expect((await as(admin).get(`/api/students/${studentId}/report`)).status).toBe(200);
  });

  it("lets a teacher at the same school", async () => {
    if (skip() || !teacher) return;
    expect((await as(teacher).get(`/api/students/${studentId}/report`)).status).toBe(200);
  });

  it("lets a parent ask for their own child", async () => {
    if (skip()) return;
    const res = await as(parent).get(`/api/students/${studentId}/report`);
    expect(res.status).toBe(200);
    expect(res.body.data.student.name).toBeTruthy();
  });

  it("refuses a parent another family's child", async () => {
    if (skip()) return;
    /**
     * A child of a *different family*, which is what this is about.
     *
     * Taking any other student in the school was not the same thing: this
     * guardian has more than one child, so the query could return their own
     * second child and the 200 that came back was correct access, not a leak.
     */
    const other = await prismaRaw.student.findFirst({
      where: {
        institute: { name: "Beaconhouse School" },
        id: { not: studentId },
        deletedAt: null,
        OR: [{ parentId: null }, { parent: { user: { email: { not: "sara@gmail.com" } } } }],
      },
      orderBy: { rollNo: "asc" },
      select: { id: true },
    });
    if (!other) return;
    // 404, not 403 — a 403 would confirm the id exists
    expect((await as(parent).get(`/api/students/${other.id}/report`)).status).toBe(404);
  });

  it("refuses another institute entirely", async () => {
    if (skip()) return;
    expect((await as(lacasAdmin).get(`/api/students/${studentId}/report`)).status).toBe(404);
    if (otherInstituteStudentId) {
      expect((await as(admin).get(`/api/students/${otherInstituteStudentId}/report`)).status).toBe(404);
    }
  });

  it("refuses an unauthenticated caller", async () => {
    if (skip()) return;
    expect((await request(app).get(`/api/students/${studentId}/report`)).status).toBe(401);
  });
});
