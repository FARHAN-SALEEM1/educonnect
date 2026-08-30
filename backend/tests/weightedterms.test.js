import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { weightedAverage } from "../src/services/term.service.js";

/**
 * A weighting that is actually applied.
 *
 * `ExamTerm.weightage` was stored, validated, and reported on every card as
 * `termsAreWeighted: true` — and then ignored. A school saying "Half Yearly
 * counts 40%, Annual 60%" got the pooled marks anyway: 79.5% where its own
 * policy says 81.2%. A product that accepts a policy, echoes it back, and
 * quietly does something else is worse than one that never offered it.
 *
 * The figures below are chosen so pooling and weighting disagree about who came
 * first, which is the part that matters — a position is the first thing a
 * Pakistani parent reads.
 *
 *   Zain   Half Yearly 71   Annual 88    pooled 79.5   weighted 81.2
 *   Bilal  Half Yearly 90   Annual 70    pooled 80.0   weighted 78.0
 *
 * Pooled, Bilal is first. Weighted, Zain is. Only one of those answers the
 * school's own policy.
 *
 * A throwaway school, erased through the application's lifecycle in afterAll.
 */

let sa, admin, instId, sessionId, seeded = true;
let zain, bilal, sana, maths;
let half, annual;
const made = [];
const stamp = Date.now();
const PASSWORD = "WeightSpec!2026";

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

const card = async (studentId, termName) =>
  (await as(admin).get(
    `/api/students/${studentId}/report${termName ? `?term=${encodeURIComponent(termName)}` : ""}`
  )).body.data;

const mark = (studentId, termName, obtained) =>
  as(admin).post("/api/assessments").send({
    studentId, subjectId: maths, title: `${termName} Exam`, type: "EXAM",
    term: termName, obtained, total: 100, takenOn: "2026-05-20",
  });

/** Turns the weighting off again, so a test can compare against pooling. */
const clearWeights = async () => {
  for (const t of [half, annual]) {
    await as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/${t}`).send({ weightage: null });
  }
};
const setWeights = async () => {
  await as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/${half}`).send({ weightage: 40 });
  await as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/${annual}`).send({ weightage: 60 });
};

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `wt.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Weighted School ${stamp}`, city: "Karachi", phone: "03001234567",
    email: `wt.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Weight Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  made.push(instId);
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await tokenFor(adminEmail, PASSWORD);
  if (!admin) { seeded = false; return; }

  sessionId = (await as(admin).get("/api/institutes/me/session")).body.data?.current?.id;
  if (!sessionId) { seeded = false; return; }

  // Two terms, the way a Karachi school commonly runs the year. The three
  // defaults are renamed and the spare deleted.
  const defaults = (await as(admin).get(`/api/institutes/me/sessions/${sessionId}/terms`)).body.data.terms;
  const named = (n) => defaults.find((t) => t.name === n);
  await as(admin).delete(`/api/institutes/me/sessions/${sessionId}/terms/${named("Final Term").id}`);
  await as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/${named("First Term").id}`)
    .send({ name: "Half Yearly" });
  await as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/${named("Mid Term").id}`)
    .send({ name: "Annual" });

  const terms = (await as(admin).get(`/api/institutes/me/sessions/${sessionId}/terms`)).body.data.terms;
  half = terms.find((t) => t.name === "Half Yearly")?.id;
  annual = terms.find((t) => t.name === "Annual")?.id;
  if (!half || !annual) { seeded = false; return; }

  maths = (await as(admin).post("/api/subjects").send({
    name: "Mathematics", grade: "Grade 8", code: `WM-${stamp}`,
  })).body.data?.id;

  const add = async (name, roll) =>
    (await as(admin).post("/api/students").send({
      name, grade: "Grade 8", section: "A", rollNo: roll,
    })).body.data?.id;

  zain = await add("Zain Weighted", `WT1-${stamp}`);
  bilal = await add("Bilal Weighted", `WT2-${stamp}`);
  // Only sits the half-yearly, so the renormalising rule has something to do.
  sana = await add("Sana Weighted", `WT3-${stamp}`);
  if (!zain || !bilal || !sana || !maths) { seeded = false; return; }

  for (const id of [zain, bilal, sana]) {
    await as(admin).post("/api/subjects/enroll").send({ studentId: id, subjectId: maths });
  }

  await mark(zain, "Half Yearly", 71);
  await mark(zain, "Annual", 88);
  await mark(bilal, "Half Yearly", 90);
  await mark(bilal, "Annual", 70);
  await mark(sana, "Half Yearly", 60);

  await setWeights();
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

describe("the maths, on its own", () => {
  const terms = [
    { id: "h", name: "Half Yearly", weightage: 40 },
    { id: "a", name: "Annual", weightage: 60 },
  ];
  const row = (examTermId, obtained) => ({ examTermId, obtained, total: 100 });

  it("weights each term by its share", () => {
    // 71 × 0.4 + 88 × 0.6
    expect(weightedAverage([row("h", 71), row("a", 88)], terms).score).toBe(81.2);
  });

  /**
   * The half of the year that has been sat is the whole of what can be
   * reported. Counting the unsat term as zero would print a fail in December
   * for a child who is doing perfectly well.
   */
  it("scales the marked terms back up when one has not been sat", () => {
    const r = weightedAverage([row("h", 60)], terms);
    expect(r.score).toBe(60);
    expect(r.carried).toBe(40);
  });

  it("reports nothing at all when nothing has been marked", () => {
    expect(weightedAverage([], terms).score).toBeNull();
  });

  it("counts the marks that belong to no term instead of hiding them", () => {
    const r = weightedAverage([row("h", 60), row(null, 100)], terms);
    expect(r.unweighted).toBe(1);
    // The stray mark carries no weight, so it does not move the figure.
    expect(r.score).toBe(60);
  });
});

describe("the annual card applies it", () => {
  it("reports the weighted figure, not the pooled one", async () => {
    if (skip()) return;
    const d = await card(zain);
    expect(d.termsAreWeighted).toBe(true);
    expect(d.subjects[0].score).toBe(81.2);
    expect(d.average).toBe(81.2);
  });

  /**
   * The one that used to be wrong. Pooling gives 79.5 — the marks divided by
   * the marks available — which is a true statement about marks and a false
   * statement about this school's policy.
   */
  it("and the pooled figure is still there, as marks", async () => {
    if (skip()) return;
    const d = await card(zain);
    expect(d.marks).toEqual({ obtained: 159, total: 200, percentage: 79.5 });
  });

  it("grades and passes on the weighted figure", async () => {
    if (skip()) return;
    const d = await card(zain);
    expect(d.overallGrade).toBe("A+"); // 81.2 on the board scale
    expect(d.result.passed).toBe(true);
  });

  it("says which terms counted and what each carried", async () => {
    if (skip()) return;
    const d = await card(zain);
    expect(d.weighting.terms).toEqual([
      { name: "Half Yearly", weightage: 40, counted: true },
      { name: "Annual", weightage: 60, counted: true },
    ]);
    expect(d.weighting.shareCounted).toBe(100);
    expect(d.weighting.scaledUp).toBe(false);
    expect(d.weighting.marksOutsideTerms).toBe(0);
  });

  it("says so when a term has not been sat and the rest were scaled up", async () => {
    if (skip()) return;
    const d = await card(sana);
    expect(d.subjects[0].score).toBe(60);
    expect(d.weighting.shareCounted).toBe(40);
    expect(d.weighting.scaledUp).toBe(true);
    expect(d.weighting.terms.find((t) => t.name === "Annual").counted).toBe(false);
  });

  it("lays the terms out side by side", async () => {
    if (skip()) return;
    const d = await card(zain);
    expect(d.subjects[0].terms).toEqual([
      { name: "Half Yearly", sequence: 1, weightage: 40, score: 71, marks: { obtained: 71, total: 100 } },
      { name: "Annual", sequence: 2, weightage: 60, score: 88, marks: { obtained: 88, total: 100 } },
    ]);
  });
});

describe("position follows the same policy as the score above it", () => {
  /**
   * The whole point. Pooled, Bilal is ahead of Zain by half a mark; weighted,
   * Zain is ahead by three. A card that reported a weighted percentage and an
   * unweighted position would contradict itself on one sheet.
   */
  it("ranks on the weighted figures", async () => {
    if (skip()) return;
    const z = await card(zain);
    const b = await card(bilal);
    expect(z.average).toBe(81.2);
    expect(b.average).toBe(78);
    expect(z.rank).toBe(1);
    expect(b.rank).toBe(2);
  });

  it("and the other way round once the weighting is taken off", async () => {
    if (skip()) return;
    await clearWeights();

    const z = await card(zain);
    const b = await card(bilal);
    expect(z.termsAreWeighted).toBe(false);
    expect(z.weighting).toBeNull();
    // Back to the rolled-up year: the marks pooled.
    expect(z.average).toBe(79.5);
    expect(b.average).toBe(80);
    expect(b.rank).toBe(1);
    expect(z.rank).toBe(2);

    await setWeights();
    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});
  });

  /**
   * Weighting is a statement about combining terms, so it has nothing to say
   * about a card that covers one.
   */
  it("leaves a single-term card alone", async () => {
    if (skip()) return;
    const d = await card(zain, "Half Yearly");
    expect(d.term).toBe("Half Yearly");
    expect(d.subjects[0].score).toBe(71);
    expect(d.average).toBe(71);
    expect(d.weighting).toBeNull();
    expect(d.subjects[0].terms).toBeNull();
  });
});


describe("the rest of the product agrees with the card", () => {
  /**
   * `Enrollment.currentScore` is the figure every other screen reads — the
   * student list, both dashboards, the gradebook, the class position. It pooled
   * the marks while the card weighted them, so the card said first in class at
   * 81.2% and the list said second at 79.5%: the same school arguing with
   * itself one screen apart. The roll-up is weighted at write time now.
   */
  it("rolls the subject up on the weighted figure", async () => {
    if (skip()) return;
    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});

    const list = (await as(admin).get("/api/students?limit=50")).body.data;
    const z = list.find((x) => x.id === zain);
    const b = list.find((x) => x.id === bilal);

    expect(z.subjects[0].score).toBe(81.2);
    expect(b.subjects[0].score).toBe(78);
    // And the position the list reports is the position the card reports.
    expect(z.rank).toBe(1);
    expect(b.rank).toBe(2);

    const card = (await as(admin).get(`/api/students/${zain}/report`)).body.data;
    expect(card.average).toBe(z.average);
    expect(card.rank).toBe(z.rank);
  });

  /**
   * What a school is actually promised when it changes a share.
   *
   * The card recomputes from the marks, so it is right at once. Everything
   * that reads the rolled-up score — the list, the dashboards, the class
   * position — trails until the subject is recalculated. Pinning it here means
   * nobody later "fixes" the trailing by quietly rewriting rows the school did
   * not ask to touch.
   */
  it("leaves the roll-up behind until the subject is recalculated", async () => {
    if (skip()) return;
    await clearWeights();

    // The card is already pooling; the stored score is still the weighted one.
    const before = (await as(admin).get("/api/students?limit=50")).body.data
      .find((x) => x.id === zain);
    expect(before.subjects[0].score).toBe(81.2);

    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});
    const after = (await as(admin).get("/api/students?limit=50")).body.data
      .find((x) => x.id === zain);
    expect(after.subjects[0].score).toBe(79.5);

    await setWeights();
    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});
  });
  it("says how many stored scores a changed share left behind", async () => {
    if (skip()) return;
    const res = await as(admin)
      .patch(`/api/institutes/me/sessions/${sessionId}/terms/${half}`)
      .send({ weightage: 50 });
    expect(res.status).toBe(200);
    expect(res.body.data.scoresToRefresh).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/recalculated/i);

    // Renaming touches no share, so nothing is left behind.
    const rename = await as(admin)
      .patch(`/api/institutes/me/sessions/${sessionId}/terms/${half}`)
      .send({ name: "Half Yearly" });
    expect(rename.body.data.scoresToRefresh).toBe(0);

    await setWeights();
    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});
  });
});
describe("a half-configured weighting is not a weighting", () => {
  it("pools the marks until every term carries a share", async () => {
    if (skip()) return;
    await as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/${annual}`)
      .send({ weightage: null });
    // The roll-up was written under the old shares; the whole-year card reads
    // it, so it trails until the subject is recalculated. See the staleness
    // test below, which pins that contract rather than hiding it here.
    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});

    const d = await card(zain);
    expect(d.termsAreWeighted).toBe(false);
    expect(d.weighting).toBeNull();
    expect(d.average).toBe(79.5);

    await setWeights();
    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});
  });

  it("and until the shares add up to a hundred", async () => {
    if (skip()) return;
    await as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/${half}`)
      .send({ weightage: 30 });
    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});

    const d = await card(zain);
    expect(d.termsAreWeighted).toBe(false);
    expect(d.average).toBe(79.5);

    await setWeights();
    await as(admin).post(`/api/subjects/${maths}/recalculate`).send({});
  });
});
