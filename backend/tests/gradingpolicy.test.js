import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { DEFAULT_PASSING, gradingFor, gradingPolicy } from "../src/utils/grading.js";

/**
 * A school's own grading policy, and the result card that depends on it.
 *
 * The bands and the pass mark were a module constant — one scale for every
 * school on the platform. No two Pakistani schools agree on it: A+ sits at 90 in
 * some and 80 in others, plenty stop at A/B/C, and the pass mark is 33% across
 * most boards but 40% in a good many private schools. A card graded on somebody
 * else's scale is a card the school cannot stand behind.
 *
 * The card also reported percentages and nothing else, which is not how a
 * Pakistani result card is written: it is written in marks — "82 / 100" per
 * subject, "850 / 1100" at the foot — and it ends in a judgement. Reporting the
 * figures and leaving the reader to work out whether the child passed is the one
 * thing a result card must not do.
 *
 * A throwaway school, erased through the application's lifecycle in afterAll.
 */

let sa, admin, instId, seeded = true;
let student, maths, urdu;
const made = [];
const stamp = Date.now();
const PASSWORD = "GradeSpec!2026";

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

const card = async () => (await as(admin).get(`/api/students/${student}/report`)).body.data;
const subjectNamed = (c, name) => c.subjects.find((s) => s.name === name);

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `grade.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Grading School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `grade.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Grading Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  made.push(instId);
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await tokenFor(adminEmail, PASSWORD);
  if (!admin) { seeded = false; return; }

  student = (await as(admin).post("/api/students").send({
    name: "Grading Child", grade: "Grade 8", section: "A", rollNo: `GR-${stamp}`,
  })).body.data?.id;
  maths = (await as(admin).post("/api/subjects").send({
    name: "Mathematics", grade: "Grade 8", code: `GM-${stamp}`,
  })).body.data?.id;
  urdu = (await as(admin).post("/api/subjects").send({
    name: "Urdu", grade: "Grade 8", code: `GU-${stamp}`,
  })).body.data?.id;
  if (!student || !maths || !urdu) { seeded = false; return; }

  for (const sub of [maths, urdu]) {
    await as(admin).post("/api/subjects/enroll").send({ studentId: student, subjectId: sub });
  }

  // Marked out of different totals on purpose: 82/100 and 18/50. A card that
  // averaged the two percentages would report something other than 100/150.
  await as(admin).post("/api/assessments").send({
    studentId: student, subjectId: maths, title: "Annual",
    type: "EXAM", obtained: 82, total: 100, takenOn: "2026-05-20",
  });
  await as(admin).post("/api/assessments").send({
    studentId: student, subjectId: urdu, title: "Annual",
    type: "EXAM", obtained: 18, total: 50, takenOn: "2026-05-20",
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

describe("the policy itself", () => {
  it("falls back to the platform scale for a school that has set nothing", () => {
    const policy = gradingPolicy({ gradingSettings: null });
    expect(policy.passingPercentage).toBe(DEFAULT_PASSING);
    expect(policy.bands[0].letter).toBe("A+");
    expect(policy.bands[0].min).toBe(80);
  });

  /**
   * The default scale and the default pass mark have to agree.
   *
   * They did not: the scale put F below 50 while the pass mark was 33, so a
   * child on 40% was handed "Grade F" and "Result: Pass" on one sheet. Any
   * mark at or above the pass mark must carry a passing letter, and the only
   * failing letter must sit below it.
   */
  it("never calls a passing mark F", () => {
    const { bands, passingPercentage } = gradingPolicy({ gradingSettings: null });
    const floor = bands[bands.length - 1];
    expect(floor.letter).toBe("F");
    // F ends exactly where passing begins.
    expect(bands.find((b) => b.min === passingPercentage)).toBeTruthy();

    const policy = gradingFor({ gradingSettings: null });
    for (const score of [33, 40, 50, 60, 80, 100]) {
      expect(policy.passed(score)).toBe(true);
      expect(policy.letterGrade(score)).not.toBe("F");
    }
    expect(policy.letterGrade(32)).toBe("F");
    expect(policy.passed(32)).toBe(false);
  });

  it("grades on a school's own bands", () => {
    const strict = gradingFor({ gradingSettings: null });
    const generous = gradingFor({
      gradingSettings: { bands: [{ min: 70, letter: "A+", point: 4 }, { min: 0, letter: "F", point: 0 }] },
    });
    expect(strict.letterGrade(84)).toBe("A+");
    expect(generous.letterGrade(74)).toBe("A+");
    expect(strict.letterGrade(74)).toBe("A");
  });

  /**
   * `bandFor` walks the bands from the top down, so a scale with no floor would
   * return nothing for a low mark rather than the failing grade. The policy adds
   * one rather than letting a mark come back ungraded.
   */
  it("always has a floor, even if a school forgets one", () => {
    const policy = gradingFor({ gradingSettings: { bands: [{ min: 50, letter: "P", point: 1 }] } });
    expect(policy.letterGrade(80)).toBe("P");
    expect(policy.letterGrade(20)).toBeTruthy();
  });

  it("sorts bands however they arrive", () => {
    const policy = gradingFor({
      gradingSettings: {
        bands: [
          { min: 0, letter: "F", point: 0 },
          { min: 90, letter: "A", point: 4 },
          { min: 50, letter: "C", point: 2 },
        ],
      },
    });
    expect(policy.letterGrade(95)).toBe("A");
    expect(policy.letterGrade(60)).toBe("C");
    expect(policy.letterGrade(10)).toBe("F");
  });

  it("says nothing about a subject that has not been marked", () => {
    const policy = gradingFor({ gradingSettings: null });
    // Unmarked is not failed.
    expect(policy.passed(null)).toBeNull();
    expect(policy.letterGrade(null)).toBeNull();
  });

  it("passes at the school's own mark", () => {
    expect(gradingFor({ gradingSettings: null }).passed(35)).toBe(true);
    expect(gradingFor({ gradingSettings: { passingPercentage: 40 } }).passed(35)).toBe(false);
  });
});

describe("setting the policy over the API", () => {
  it("reports the defaults, and says they are defaults", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/institutes/me/grading");
    expect(res.status).toBe(200);
    expect(res.body.data.isDefault).toBe(true);
    expect(res.body.data.passingPercentage).toBe(DEFAULT_PASSING);
    expect(res.body.data.defaults.bands.length).toBeGreaterThan(0);
  });

  it("accepts a school's own scale and pass mark", async () => {
    if (skip()) return;
    const res = await as(admin).patch("/api/institutes/me/grading").send({
      passingPercentage: 40,
      bands: [
        { min: 80, letter: "A+", point: 4 },
        { min: 65, letter: "B", point: 3 },
        { min: 40, letter: "C", point: 2 },
        { min: 0, letter: "F", point: 0 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.passingPercentage).toBe(40);
    expect(res.body.data.bands[0].min).toBe(80);
    expect(res.body.message).toMatch(/straight away/i);
  });

  it("refuses two bands that start at the same percentage", async () => {
    if (skip()) return;
    const res = await as(admin).patch("/api/institutes/me/grading").send({
      bands: [
        { min: 50, letter: "A", point: 4 },
        { min: 50, letter: "B", point: 3 },
        { min: 0, letter: "F", point: 0 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/two grades/i);
  });

  it("refuses a scale with no floor", async () => {
    if (skip()) return;
    const res = await as(admin).patch("/api/institutes/me/grading").send({
      bands: [{ min: 50, letter: "P", point: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lowest band/i);
  });

  it("refuses a pass mark outside 0–100 and an empty scale", async () => {
    if (skip()) return;
    expect((await as(admin).patch("/api/institutes/me/grading").send({ passingPercentage: 140 })).status).toBe(400);
    expect((await as(admin).patch("/api/institutes/me/grading").send({ bands: [] })).status).toBe(400);
  });

  it("is closed to a teacher, and to another school", async () => {
    if (skip()) return;
    const t = await as(admin).post("/api/teachers").send({
      name: "Grading Teacher", email: `grade.t.${stamp}@test.edu`,
      phone: "03001111111", subject: "Mathematics", createLogin: true, password: PASSWORD,
    });
    expect(t.status).toBe(201);
    const teacher = await tokenFor(`grade.t.${stamp}@test.edu`, PASSWORD);
    if (!teacher) return;

    // A teacher may read the scale their marks are graded on, not change it.
    expect((await as(teacher).get("/api/institutes/me/grading")).status).toBe(200);
    expect((await as(teacher).patch("/api/institutes/me/grading").send({ passingPercentage: 1 })).status).toBe(403);
  });
});

describe("the result card that comes out of it", () => {
  it("carries the marks, not just the percentage", async () => {
    if (skip()) return;
    const c = await card();
    expect(subjectNamed(c, "Mathematics").marks).toEqual({ obtained: 82, total: 100 });
    expect(subjectNamed(c, "Urdu").marks).toEqual({ obtained: 18, total: 50 });
  });

  /**
   * Summed from the marks, not averaged from the percentages. 82% and 36%
   * average to 59%, but 100 out of 150 is 66.7% — and the school means the
   * second, because Urdu was worth half as much.
   */
  it("totals the marks rather than averaging the percentages", async () => {
    if (skip()) return;
    const c = await card();
    expect(c.marks).toEqual({ obtained: 100, total: 150, percentage: 66.7 });
  });

  it("grades each subject on the school's own bands", async () => {
    if (skip()) return;
    const c = await card();
    // Under the scale set above: 82% → A+, 36% → F.
    expect(subjectNamed(c, "Mathematics").grade).toBe("A+");
    expect(subjectNamed(c, "Urdu").grade).toBe("F");
  });

  it("says which subjects were passed, at the school's own pass mark", async () => {
    if (skip()) return;
    const c = await card();
    expect(subjectNamed(c, "Mathematics").passed).toBe(true);
    // 18/50 is 36%, below the 40% this school passes at.
    expect(subjectNamed(c, "Urdu").passed).toBe(false);
  });

  it("ends in a result", async () => {
    if (skip()) return;
    const c = await card();
    expect(c.result.passingPercentage).toBe(40);
    expect(c.result.subjectsJudged).toBe(2);
    expect(c.result.subjectsPassed).toBe(1);
    expect(c.result.subjectsFailed).toBe(1);
    // One subject failed, so the year is not passed however good the average.
    expect(c.result.passed).toBe(false);
  });

  it("follows the school when it lowers the pass mark", async () => {
    if (skip()) return;
    await as(admin).patch("/api/institutes/me/grading").send({ passingPercentage: 33 });

    const c = await card();
    // 36% now clears the bar, and with it the whole year.
    expect(subjectNamed(c, "Urdu").passed).toBe(true);
    expect(c.result.subjectsFailed).toBe(0);
    expect(c.result.passed).toBe(true);
  });

  it("reports no result at all for a session with no marks", async () => {
    if (skip()) return;
    // The school's own name for the term, not an enum value — and a term
    // nobody has marked yet, so the card has nothing to report.
    const res = await as(admin).get(`/api/students/${student}/report?term=Final%20Term`);
    expect(res.status).toBe(200);
    expect(res.body.data.result).toBeNull();
    expect(res.body.data.marks).toBeNull();
  });
});
