import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Paging a list must not lose a child.
 *
 * The roster sorts by name, and Pakistani rolls are full of repeated names —
 * three Abdul Rehmans and two Ahmed Alis in a single grade is ordinary. A sort
 * on name alone leaves those rows tied, and a database is free to return ties
 * in a different order for every query. The portal fetches the roll a page at a
 * time, so a row that moved between two of those queries came back twice while
 * another was never returned at all.
 *
 * At two thousand students that was one child duplicated and one child missing
 * from the school's own list — found because React complained about a repeated
 * key, not because anything looked wrong on screen. Nothing announces it: the
 * count at the top of the page is a separate `count()` and stays correct.
 *
 * A unique tiebreaker fixes it, and every paged list has one now.
 *
 * What this file cannot do is force the collision. Twelve rows sharing a name
 * come back in insertion order every time — Postgres reads a small table
 * straight through, and the ordering only becomes a lottery once the planner
 * has room to choose. Removing the tiebreaker leaves the tests below green.
 * The failure was proved the other way: eleven pages of two thousand students
 * in the running system, three times, 2006 rows for 2005 distinct children.
 *
 * So the behavioural tests below are a floor — they would catch paging broken
 * outright — and the last block is the one that actually holds the fix down,
 * by reading the sort each list is built with.
 *
 * One throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "PagingSpec123";
const SAME_NAME = "Abdul Rehman Chaudhry";
const HOW_MANY = 12;
const PAGE = 5;

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
});

let sa, admin, instId;
let seeded = true;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `paging.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Paging School ${stamp}`,
    city: "Multan",
    phone: "03001234567",
    email: `paging.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "Paging Admin",
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

  /**
   * Every child with the same name, so that every row is tied with every other
   * and the sort has nothing but the tiebreaker to go on. Roll numbers differ
   * because the database insists — the sort never looks at them.
   */
  for (let n = 1; n <= HOW_MANY; n++) {
    const res = await as(admin)
      .post("/api/students")
      .send({
        name: SAME_NAME,
        grade: "Grade 6",
        section: "A",
        rollNo: `PAGE-${String(n).padStart(2, "0")}-${stamp}`,
      });
    if (res.status !== 201) seeded = false;
  }
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

/** Walks a list the way the portal does, and reports what came back. */
const pageThrough = async (path) => {
  const ids = [];
  for (let page = 1; page <= Math.ceil(HOW_MANY / PAGE) + 1; page++) {
    const res = await as(admin).get(`${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=${PAGE}`);
    expect(res.status).toBe(200);
    for (const row of res.body.data) ids.push(row.id);
    if (res.body.data.length < PAGE) break;
  }
  return ids;
};

describe("twelve children with one name between them", () => {
  it("returns each of them exactly once", async () => {
    if (skip()) return;
    const ids = await pageThrough("/api/students");

    expect(ids, "every page turned").toHaveLength(HOW_MANY);
    expect(new Set(ids).size, "one row seen twice means another was never seen").toBe(HOW_MANY);
  });

  it("returns the same order every time it is asked", async () => {
    if (skip()) return;
    const runs = [await pageThrough("/api/students"), await pageThrough("/api/students"), await pageThrough("/api/students")];

    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });

  it("agrees with the count printed above the list", async () => {
    if (skip()) return;
    const ids = await pageThrough("/api/students");
    const head = await as(admin).get("/api/students?page=1&limit=1");

    expect(
      head.body.meta.total,
      "the total is a separate count, so a lost row never shows up here"
    ).toBe(new Set(ids).size);
  });

  it("holds when the roll is sorted by something else", async () => {
    if (skip()) return;
    for (const sortBy of ["rollNo", "grade", "createdAt"]) {
      const ids = await pageThrough(`/api/students?sortBy=${sortBy}`);
      expect(new Set(ids).size, `sorted by ${sortBy}`).toBe(HOW_MANY);
    }
  });
});

describe("the other lists a portal pages through", () => {
  /**
   * Same fault, same shape: a single-column sort with ties in it. These have
   * fewer rows here than the roster does, so this asserts the ordering rather
   * than trying to force a collision in each one.
   */
  it("all sort by something unique in the end", async () => {
    if (skip()) return;
    for (const path of ["/api/teachers", "/api/parents", "/api/messages", "/api/notices"]) {
      const first = await as(admin).get(`${path}?page=1&limit=50`);
      expect(first.status, path).toBe(200);

      const again = await as(admin).get(`${path}?page=1&limit=50`);
      expect(
        again.body.data.map((r) => r.id),
        `${path} returned a different order the second time it was asked`
      ).toEqual(first.body.data.map((r) => r.id));
    }
  });
});

describe("what every paged list is sorted by", () => {
  /**
   * The decidable half. A sort that can tie is a sort that can page badly, so
   * each of these has to end on something unique — the id.
   */
  const LISTS = [
    ["assessment", 'orderBy: [{ takenOn: "desc" }, { id: "asc" }]'],
    ["fee", 'orderBy: [{ period: "desc" }, { student: { name: "asc" } }, { id: "asc" }]'],
    ["institute", 'orderBy: [{ joinedAt: "desc" }, { id: "asc" }]'],
    ["message", 'orderBy: [{ createdAt: "desc" }, { id: "asc" }]'],
    ["notice", 'orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { id: "asc" }]'],
    ["parent", 'orderBy: [{ name: "asc" }, { id: "asc" }]'],
    ["student", 'orderBy: [{ [sortBy]: order }, { id: "asc" }]'],
    ["teacher", 'orderBy: [{ name: "asc" }, { id: "asc" }]'],
    ["user", 'orderBy: [{ createdAt: "desc" }, { id: "asc" }]'],
  ];

  it("ends on the id, in every one of them", async () => {
    const { readFileSync } = await import("node:fs");
    const missing = LISTS.filter(
      ([name, sort]) => !readFileSync(`src/controllers/${name}.controller.js`, "utf8").includes(sort)
    ).map(([name]) => name);

    expect(missing, "a paged list whose sort can tie will duplicate and drop rows").toEqual([]);
  });
});
