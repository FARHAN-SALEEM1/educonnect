import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { DEFAULT_TERMS, weightingIsComplete } from "../src/services/term.service.js";

/**
 * Examination terms a school names for itself.
 *
 * These were `enum AssessmentTerm { FIRST, MID, FINAL }` — three terms with
 * those names, decided once for every school on the platform. Plenty of
 * Pakistani schools run two, Half Yearly and Annual; some run four; and the
 * names differ everywhere. A school that cannot name its own terms cannot
 * produce its own result card.
 *
 * They belong to a session rather than an institute, for the same reason
 * enrolments do: a school moving from three terms to two must not lose the terms
 * last year's cards were written in.
 *
 * A throwaway school, erased through the application's lifecycle in afterAll.
 */

let sa, admin, teacher, instId, sessionId, seeded = true;
const made = [];
const stamp = Date.now();
const PASSWORD = "TermSpec!2026";

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

const terms = (token = admin) => as(token).get(`/api/institutes/me/sessions/${sessionId}/terms`);
const addTerm = (body) => as(admin).post(`/api/institutes/me/sessions/${sessionId}/terms`).send(body);
const editTerm = (id, body) =>
  as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/${id}`).send(body);
const dropTerm = (id) => as(admin).delete(`/api/institutes/me/sessions/${sessionId}/terms/${id}`);

const named = (list, name) => list.find((t) => t.name === name);

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `term.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Term School ${stamp}`, city: "Karachi", phone: "03001234567",
    email: `term.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Term Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  made.push(instId);
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await tokenFor(adminEmail, PASSWORD);
  if (!admin) { seeded = false; return; }

  const t = await as(admin).post("/api/teachers").send({
    name: "Term Teacher", email: `term.t.${stamp}@test.edu`, phone: "03001111111",
    subject: "Mathematics", createLogin: true, password: PASSWORD,
  });
  if (t.status === 201) teacher = await tokenFor(`term.t.${stamp}@test.edu`, PASSWORD);

  const session = await as(admin).get("/api/institutes/me/session");
  sessionId = session.body.data?.current?.id;
  if (!sessionId) seeded = false;
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

describe("what a school starts with", () => {
  it("gets the standard three the first time it asks", async () => {
    if (skip()) return;
    const res = await terms();
    expect(res.status).toBe(200);
    expect(res.body.data.terms.map((t) => t.name)).toEqual(DEFAULT_TERMS.map((t) => t.name));
    expect(res.body.data.terms.map((t) => t.sequence)).toEqual([1, 2, 3]);
  });

  /**
   * Null on purpose. Weighting the terms into a combined annual result is a
   * policy a school should choose deliberately; with no weights the annual card
   * pools the year's marks, which is what it did before terms were nameable.
   */
  it("does not weight them until the school says to", async () => {
    if (skip()) return;
    const res = await terms();
    expect(res.body.data.terms.every((t) => t.weightage === null)).toBe(true);
    expect(res.body.data.weighted).toBe(false);
    expect(res.body.data.totalWeightage).toBe(0);
  });

  it("does not make a second set on a second ask", async () => {
    if (skip()) return;
    await terms();
    await terms();
    expect(await prismaRaw.examTerm.count({ where: { academicSessionId: sessionId } })).toBe(3);
  });
});

describe("a school naming its own terms", () => {
  it("renames one", async () => {
    if (skip()) return;
    const first = named((await terms()).body.data.terms, "First Term");
    const res = await editTerm(first.id, { name: "Half Yearly" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Half Yearly");

    // And back, so the rest of this file reads the way it is written.
    await editTerm(first.id, { name: "First Term" });
  });

  it("adds a fourth", async () => {
    if (skip()) return;
    const res = await addTerm({ name: "Pre-Board", sequence: 4 });
    expect(res.status).toBe(201);
    expect((await terms()).body.data.terms).toHaveLength(4);
  });

  it("refuses a name the year already uses, whatever the casing", async () => {
    if (skip()) return;
    expect((await addTerm({ name: "Mid Term", sequence: 9 })).status).toBe(400);
    expect((await addTerm({ name: "mid term", sequence: 9 })).status).toBe(400);
  });

  it("refuses two terms at the same position in the year", async () => {
    if (skip()) return;
    const res = await addTerm({ name: "Extra", sequence: 2 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/position/i);
  });

  it("refuses a term with no name and one with no position", async () => {
    if (skip()) return;
    expect((await addTerm({ name: "   ", sequence: 7 })).status).toBe(400);
    expect((await addTerm({ name: "Nameless" })).status).toBe(400);
  });

  /**
   * The marks survive the term. A school correcting a term it created by
   * mistake must not lose the exam that was sat under it — the foreign key is
   * SetNull, and the response says how many marks were released.
   */
  it("removes one without taking its marks", async () => {
    if (skip()) return;
    const extra = named((await terms()).body.data.terms, "Pre-Board");
    const res = await dropTerm(extra.id);
    expect(res.status).toBe(200);
    expect(res.body.data.marksReleased).toBe(0);
    expect((await terms()).body.data.terms).toHaveLength(3);
  });
});

describe("weighting the year", () => {
  it("is off until every term carries a share", () => {
    expect(weightingIsComplete([])).toBe(false);
    expect(weightingIsComplete([{ weightage: 50 }, { weightage: null }])).toBe(false);
    // Shares that do not add up are a half-finished policy, not a policy.
    expect(weightingIsComplete([{ weightage: 30 }, { weightage: 30 }])).toBe(false);
    expect(weightingIsComplete([{ weightage: 25 }, { weightage: 25 }, { weightage: 50 }])).toBe(true);
  });

  it("turns on once the shares add up to a hundred", async () => {
    if (skip()) return;
    const list = (await terms()).body.data.terms;
    await editTerm(named(list, "First Term").id, { weightage: 25 });
    await editTerm(named(list, "Mid Term").id, { weightage: 25 });

    // Two of three weighted is not a weighted year.
    expect((await terms()).body.data.weighted).toBe(false);

    await editTerm(named(list, "Final Term").id, { weightage: 50 });
    const res = await terms();
    expect(res.body.data.weighted).toBe(true);
    expect(res.body.data.totalWeightage).toBe(100);
  });

  it("refuses a share outside 0–100", async () => {
    if (skip()) return;
    const first = named((await terms()).body.data.terms, "First Term");
    expect((await editTerm(first.id, { weightage: 140 })).status).toBe(400);
    expect((await editTerm(first.id, { weightage: -5 })).status).toBe(400);
  });

  it("lets a school turn weighting back off", async () => {
    if (skip()) return;
    const first = named((await terms()).body.data.terms, "First Term");
    await editTerm(first.id, { weightage: null });
    expect((await terms()).body.data.weighted).toBe(false);

    await editTerm(first.id, { weightage: 25 });
  });
});

describe("terms belong to one year", () => {
  it("a second session starts with its own three", async () => {
    if (skip()) return;
    await as(admin).patch("/api/institutes/me/session").send({ currentSession: "2027-28" });
    const next = (await as(admin).get("/api/institutes/me/session")).body.data.current.id;
    expect(next).not.toBe(sessionId);

    const res = await as(admin).get(`/api/institutes/me/sessions/${next}/terms`);
    expect(res.body.data.terms.map((t) => t.name)).toEqual(DEFAULT_TERMS.map((t) => t.name));
    // Its own rows, not last year's — and unweighted, because weighting is a
    // choice made per year.
    expect(res.body.data.terms.every((t) => t.weightage === null)).toBe(true);

    // Last year keeps what it was given.
    const lastYear = await terms();
    expect(lastYear.body.data.weighted).toBe(true);

    await as(admin).patch("/api/institutes/me/session").send({ currentSession: "2026-27" });
  });
});

describe("who may change them", () => {
  it("lets a teacher read the terms their marks are filed under", async () => {
    if (skip() || !teacher) return;
    expect((await terms(teacher)).status).toBe(200);
  });

  it("does not let a teacher change them", async () => {
    if (skip() || !teacher) return;
    const res = await as(teacher)
      .post(`/api/institutes/me/sessions/${sessionId}/terms`)
      .send({ name: "Teacher's Term", sequence: 8 });
    expect(res.status).toBe(403);
  });

  it("does not reach another school's session", async () => {
    if (skip()) return;
    const otherEmail = `term.other.${stamp}@test.edu`;
    const other = await request(app).post("/api/auth/signup").send({
      name: `Term Other ${stamp}`, city: "Lahore", phone: "03001234567",
      email: `term.otherschool.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
      adminName: "Other Admin", adminEmail: otherEmail, adminPassword: PASSWORD,
    });
    const otherId = other.body.data?.institute?.id;
    if (!otherId) return;
    made.push(otherId);
    await as(sa).patch(`/api/institutes/${otherId}/status`).send({ status: "ACTIVE" });
    const otherAdmin = await tokenFor(otherEmail, PASSWORD);

    // Scoped to the caller's own institute, so it simply is not there.
    const res = await as(otherAdmin).get(`/api/institutes/me/sessions/${sessionId}/terms`);
    expect(res.status).toBe(404);
  });

  it("is closed to an unauthenticated caller", async () => {
    if (skip()) return;
    const res = await request(app).get(`/api/institutes/me/sessions/${sessionId}/terms`);
    expect(res.status).toBe(401);
  });
});
