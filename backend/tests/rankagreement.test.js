import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Three screens, one position.
 *
 * The result card has always refused a rank to a child with nothing recorded —
 * *a position needs a mark to stand on*, because `averageScore` returns 0 for
 * them and ranking them sorts a child who has not sat anything against children
 * who have. The student list and the student detail did not follow that rule:
 * they handed every child a number. Measured on the seeded school:
 *
 *     student            list   detail   card
 *     Bilal Raza            3        3      3
 *     Fatima                5        5   null
 *     Hania Malik           1        1      1
 *     shanawar bhatti       4        4   null
 *     Zain Ahmed            2        2      2
 *
 * So a parent read "Ranked #4 of 5" on the Grades tab and found the same field
 * blank on the printed card, for the same child on the same day.
 *
 * The rule now comes from one place. The card's own test is `scoreFor`, which
 * on a year card is `enrollment.currentScore`, so the list and detail ask
 * exactly that and nothing new is invented — an enrolment carrying a score but
 * no assessments still counts, on all three.
 *
 * `classSize` is deliberately untouched: an unmarked child is still in the
 * class, they simply have no place in the order yet.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "RankAgree123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

let sa, admin, instId, subject;
let top, second, unmarked;
let seeded = true;

/** What each of the three screens says about one child. */
const threeViews = async (id) => {
  const [listRes, detail, report] = await Promise.all([
    as(admin).get("/api/students?limit=100"),
    as(admin).get(`/api/students/${id}`),
    as(admin).get(`/api/students/${id}/report`),
  ]);
  const row = (listRes.body.data ?? []).find((s) => s.id === id);
  return {
    list: { rank: row?.rank ?? null, classSize: row?.classSize ?? null },
    detail: { rank: detail.body.data?.rank ?? null, classSize: detail.body.data?.classSize ?? null },
    report: { rank: report.body.data?.rank ?? null, classSize: report.body.data?.classSize ?? null },
  };
};

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `rank.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Rank School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `rank.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "Rank Admin",
    adminEmail,
    adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) {
    seeded = false;
    return;
  }
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await login(adminEmail);

  subject = (
    await as(admin).post("/api/subjects").send({
      name: "Mathematics",
      grade: "Grade 8",
      code: `RK-${stamp}`,
    })
  ).body.data;

  const make = async (name, roll) =>
    (
      await as(admin).post("/api/students").send({
        name,
        grade: "Grade 8",
        section: "A",
        rollNo: roll,
      })
    ).body.data;

  top = await make("Rank Top", `RK-1-${stamp}`);
  second = await make("Rank Second", `RK-2-${stamp}`);
  unmarked = await make("Rank Unmarked", `RK-3-${stamp}`);
  if (!subject || !top || !second || !unmarked) {
    seeded = false;
    return;
  }

  // Two children sit the paper; the third is enrolled in nothing at all.
  for (const [s, obtained] of [
    [top, 90],
    [second, 60],
  ]) {
    await as(admin).post("/api/subjects/enroll").send({ studentId: s.id, subjectId: subject.id });
    const mark = await as(admin).post("/api/assessments").send({
      studentId: s.id,
      subjectId: subject.id,
      title: "Mid Term",
      type: "EXAM",
      obtained,
      total: 100,
    });
    if (mark.status !== 201) seeded = false;
  }
}, 60_000);

afterAll(async () => {
  if (instId) await prismaRaw.institute.delete({ where: { id: instId } }).catch(() => {});
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

describe("a child who has been marked", () => {
  it("has the same position on all three screens", async () => {
    if (skip()) return;
    const v = await threeViews(top.id);

    expect(v.list.rank).toBe(1);
    expect(v.detail.rank).toBe(v.list.rank);
    expect(v.report.rank).toBe(v.list.rank);
  });

  it("keeps its place behind the better average", async () => {
    if (skip()) return;
    const v = await threeViews(second.id);

    expect(v.list.rank).toBe(2);
    expect(v.detail.rank).toBe(2);
    expect(v.report.rank).toBe(2);
  });
});

describe("a child with nothing recorded", () => {
  it("has no position anywhere, rather than one on some screens", async () => {
    if (skip()) return;
    const v = await threeViews(unmarked.id);

    expect(v.list.rank, "the list used to hand out a number here").toBeNull();
    expect(v.detail.rank).toBeNull();
    expect(v.report.rank).toBeNull();
  });

  /**
   * They are still in the class. Dropping them from the size would be a second
   * bug wearing the first one's clothes: "1st of 2" in a class of three.
   */
  it("is still counted in the class size", async () => {
    if (skip()) return;
    const v = await threeViews(unmarked.id);

    expect(v.list.classSize).toBe(3);
    expect(v.detail.classSize).toBe(3);
    expect(v.report.classSize).toBe(3);
  });

  it("does not push the marked children down the order", async () => {
    if (skip()) return;
    const marked = await Promise.all([threeViews(top.id), threeViews(second.id)]);

    expect(marked.map((v) => v.list.rank)).toEqual([1, 2]);
    expect(marked.every((v) => v.list.classSize === 3)).toBe(true);
  });
});

describe("once that child is marked too", () => {
  it("they take a position on all three at once", async () => {
    if (skip()) return;
    await as(admin)
      .post("/api/subjects/enroll")
      .send({ studentId: unmarked.id, subjectId: subject.id });
    const mark = await as(admin).post("/api/assessments").send({
      studentId: unmarked.id,
      subjectId: subject.id,
      title: "Mid Term",
      type: "EXAM",
      obtained: 75,
      total: 100,
    });
    expect(mark.status, mark.body.message).toBe(201);

    const v = await threeViews(unmarked.id);
    // 75 sits between 90 and 60.
    expect(v.list.rank).toBe(2);
    expect(v.detail.rank).toBe(2);
    expect(v.report.rank).toBe(2);
  });
});
