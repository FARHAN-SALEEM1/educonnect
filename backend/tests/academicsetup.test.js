import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { DEFAULT_PASSING } from "../src/utils/grading.js";

/**
 * What a school is asked at the door, and what it can rearrange afterwards.
 *
 * Two gaps, both of the same shape as everything else in this area: the product
 * held an opinion the school was never asked about.
 *
 *  - Every signup got an April-to-March year, a 33% pass mark and three terms
 *    called First/Mid/Final. April is right for most of Pakistan and wrong for
 *    Karachi and the Cambridge track, and a school that noticed later had to
 *    edit its session dates by hand.
 *
 *  - Reordering terms meant deleting one and adding it back, which released
 *    every mark recorded under it. A cosmetic change should not cost a school
 *    its exam records.
 *
 * Throwaway schools, erased through the application's lifecycle in afterAll.
 */

let sa, seeded = true;
const made = [];
const stamp = Date.now();
const PASSWORD = "SetupSpec!2026";

const tokenFor = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
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

let seq = 0;
/** Registers a school, activates it, and signs its admin in. */
const register = async (extra = {}) => {
  const n = ++seq;
  const adminEmail = `su.admin.${n}.${stamp}@test.edu`;
  const res = await request(app).post("/api/auth/signup").send({
    name: `Setup School ${n} ${stamp}`, city: "Karachi", phone: "03001234567",
    email: `su.school.${n}.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Setup Admin", adminEmail, adminPassword: PASSWORD,
    ...extra,
  });
  if (res.status !== 201) return { status: res.status, body: res.body };
  const id = res.body.data.institute.id;
  made.push(id);
  await as(sa).patch(`/api/institutes/${id}/status`).send({ status: "ACTIVE" });
  return { status: res.status, id, admin: await tokenFor(adminEmail, PASSWORD) };
};

const sessionOf = async (token) =>
  (await as(token).get("/api/institutes/me/session")).body.data.current;
const termsOf = async (token, sessionId) =>
  (await as(token).get(`/api/institutes/me/sessions/${sessionId}/terms`)).body.data.terms;

/** "2026-04-01T00:00:00.000Z" → 4. Sessions are pinned at UTC midnight. */
const monthOf = (iso) => new Date(iso).getUTCMonth() + 1;

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) seeded = false;
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

describe("a school that says nothing gets what it always got", () => {
  it("an April year, the platform pass mark, and no terms until asked", async () => {
    if (skip()) return;
    const { admin } = await register();
    const session = await sessionOf(admin);

    expect(monthOf(session.startsOn)).toBe(4);
    expect(monthOf(session.endsOn)).toBe(3);

    const grading = (await as(admin).get("/api/institutes/me/grading")).body.data;
    expect(grading.passingPercentage).toBe(DEFAULT_PASSING);
    expect(grading.isDefault).toBe(true);

    // ensureTerms still supplies the standard three on first ask.
    const terms = await termsOf(admin, session.id);
    expect(terms.map((t) => t.name)).toEqual(["First Term", "Mid Term", "Final Term"]);
  });
});

describe("a school that says what it runs", () => {
  it("gets its own year, its own pass mark and its own terms", async () => {
    if (skip()) return;
    const { admin } = await register({
      sessionStartMonth: 8,
      passingPercentage: 40,
      terms: ["Half Yearly", "Annual"],
    });

    const session = await sessionOf(admin);
    // August to July — the Karachi and Cambridge-track year.
    expect(monthOf(session.startsOn)).toBe(8);
    expect(monthOf(session.endsOn)).toBe(7);

    const grading = (await as(admin).get("/api/institutes/me/grading")).body.data;
    expect(grading.passingPercentage).toBe(40);
    expect(grading.isDefault).toBe(false);

    const terms = await termsOf(admin, session.id);
    expect(terms.map((t) => t.name)).toEqual(["Half Yearly", "Annual"]);
    expect(terms.map((t) => t.sequence)).toEqual([1, 2]);
    /**
     * Unweighted on purpose. A share is a policy a school states deliberately,
     * and a registration form is not the place to hold it to one.
     */
    expect(terms.every((t) => t.weightage === null)).toBe(true);
  });

  it("keeps the bands even while setting the pass mark", async () => {
    if (skip()) return;
    const { admin } = await register({ passingPercentage: 50 });
    const grading = (await as(admin).get("/api/institutes/me/grading")).body.data;
    expect(grading.passingPercentage).toBe(50);
    // The scale it did not mention is still the platform's.
    expect(grading.bands).toEqual(grading.defaults.bands);
  });

  it("refuses a year with the same term twice", async () => {
    if (skip()) return;
    const res = await register({ terms: ["Annual", "annual"] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/both called/i);
  });

  it("refuses a month that is not one", async () => {
    if (skip()) return;
    expect((await register({ sessionStartMonth: 13 })).status).toBe(422);
    expect((await register({ sessionStartMonth: 0 })).status).toBe(422);
  });

  it("refuses a pass mark that is not a percentage", async () => {
    if (skip()) return;
    expect((await register({ passingPercentage: 140 })).status).toBe(422);
  });
});

describe("putting the year in a different order", () => {
  let admin, sessionId, terms;

  const load = async () => {
    terms = await termsOf(admin, sessionId);
    return terms;
  };
  const reorder = (order) =>
    as(admin).patch(`/api/institutes/me/sessions/${sessionId}/terms/order`).send({ order });

  beforeAll(async () => {
    if (skip()) return;
    const r = await register({ terms: ["First Term", "Mid Term", "Final Term"] });
    admin = r.admin;
    sessionId = (await sessionOf(admin)).id;
    await load();
  });

  /**
   * The move that was impossible one term at a time: nothing can take position
   * 1 while something else is still holding it, and the old advice was to
   * delete a term and add it back — which released every mark under it.
   */
  it("swaps two terms without deleting either", async () => {
    if (skip()) return;
    const [first, mid, final] = terms;
    const res = await reorder([mid.id, first.id, final.id]);

    expect(res.status).toBe(200);
    expect(res.body.data.terms.map((t) => t.name)).toEqual([
      "Mid Term", "First Term", "Final Term",
    ]);
    expect(res.body.data.terms.map((t) => t.sequence)).toEqual([1, 2, 3]);

    // Same rows, so nothing that pointed at them has been broken.
    expect(new Set(res.body.data.terms.map((t) => t.id)))
      .toEqual(new Set([first.id, mid.id, final.id]));

    await reorder([first.id, mid.id, final.id]);
  });

  it("reverses the whole year in one go", async () => {
    if (skip()) return;
    const ids = (await load()).map((t) => t.id);
    const res = await reorder([...ids].reverse());
    expect(res.body.data.terms.map((t) => t.sequence)).toEqual([1, 2, 3]);
    expect(res.body.data.terms.map((t) => t.name)).toEqual([
      "Final Term", "Mid Term", "First Term",
    ]);
    await reorder(ids);
  });

  /**
   * A partial order would leave the unmentioned terms where they were, which is
   * how two terms end up at position 2 and neither can be saved again.
   */
  it("insists on the whole year", async () => {
    if (skip()) return;
    const ids = (await load()).map((t) => t.id);
    const res = await reorder(ids.slice(0, 2));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/every term/i);
  });

  it("refuses a list with the same term twice", async () => {
    if (skip()) return;
    const ids = (await load()).map((t) => t.id);
    const res = await reorder([ids[0], ids[0], ids[1]]);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/twice/i);
  });

  it("refuses a term from somewhere else", async () => {
    if (skip()) return;
    const ids = (await load()).map((t) => t.id);
    const res = await reorder([ids[0], ids[1], "cmxnotarealtermid00000"]);
    expect(res.status).toBe(404);
  });

  it("refuses an empty order", async () => {
    if (skip()) return;
    expect((await reorder([])).status).toBe(400);
  });

  it("is closed to a teacher", async () => {
    if (skip()) return;
    const ids = (await load()).map((t) => t.id);
    const t = await as(admin).post("/api/teachers").send({
      name: "Order Teacher", email: `su.t.${stamp}@test.edu`, phone: "03001111111",
      subject: "Mathematics", createLogin: true, password: PASSWORD,
    });
    if (t.status !== 201) return;
    const teacher = await tokenFor(`su.t.${stamp}@test.edu`, PASSWORD);
    const res = await as(teacher)
      .patch(`/api/institutes/me/sessions/${sessionId}/terms/order`)
      .send({ order: ids });
    expect(res.status).toBe(403);
  });
});
