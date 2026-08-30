import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import {
  defaultSpan,
  nextSessionName,
  parseSessionName,
  sessionForDate,
  sessionNameForDate,
} from "../src/services/session.service.js";

/**
 * The academic session, as a span of days rather than a string.
 *
 * `Institute.currentSession` has always been a bare name — "2026-27" — with the
 * April-to-March convention living in a code comment. That left a question the
 * product will have to answer for every result card it ever prints with no way
 * to answer it: which session does this attendance row belong to, or this fee
 * period, or this mark? Nothing could say, because a session had no edges.
 *
 * These pin the edges, and pin that they belong to the school. April-to-March is
 * what a Pakistani school gets by default; a Karachi or Cambridge-track school
 * running August-to-July has to be able to say so, and a school that cannot
 * state its own year cannot be handed a correct card.
 *
 * A throwaway school, erased through the application's lifecycle in afterAll.
 */

let sa, admin, instId, seeded = true;
const made = [];
const stamp = Date.now();
const PASSWORD = "SessionSpec!2026";

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

const makeSchool = async (label) => {
  const adminEmail = `session.${label}.${stamp}@test.edu`;
  const res = await request(app).post("/api/auth/signup").send({
    name: `Session ${label} School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `session.school.${label}.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: `Session ${label} Admin`, adminEmail, adminPassword: PASSWORD,
  });
  const id = res.body.data?.institute?.id;
  if (!id) return {};
  made.push(id);
  await as(sa).patch(`/api/institutes/${id}/status`).send({ status: "ACTIVE" });
  return { id, adminEmail, token: await tokenFor(adminEmail, PASSWORD) };
};

const purgeSchool = async (id) => {
  const removed = await as(sa).delete(`/api/institutes/${id}`);
  const purged = removed.status === 200 ? await as(sa).delete(`/api/institutes/${id}/purge`) : null;
  // Only if the lifecycle did not already take it — Prisma logs its own error
  // block before rejecting, so an unconditional delete fills the run with red
  // for rows that are simply already gone.
  if (purged?.status !== 200) {
    await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  }
};

const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d) => new Date(d).toISOString().slice(0, 10);

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }
  const school = await makeSchool("main");
  if (!school.id || !school.token) { seeded = false; return; }
  instId = school.id;
  admin = school.token;
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

describe("reading a session name", () => {
  it("accepts a year pair that advances by one", () => {
    expect(parseSessionName("2026-27")).toEqual({ from: 2026, to: 2027 });
    expect(parseSessionName("  2027-28 ")).toEqual({ from: 2027, to: 2028 });
  });

  /**
   * The second half is checked against the year that follows rather than pasted
   * onto the first half's century. Pasting reads 2099-00 as the year 2000 and
   * rejects a perfectly good name at the turn of a century.
   */
  it("survives the turn of a century", () => {
    expect(parseSessionName("2099-00")).toEqual({ from: 2099, to: 2100 });
    expect(nextSessionName("2099-00")).toBe("2100-01");
  });

  it("refuses a pair that does not advance by exactly one year", () => {
    for (const bad of ["2026-28", "2026-26", "2026-25"]) {
      expect(parseSessionName(bad), `${bad} should be refused`).toBeNull();
    }
  });

  it("refuses anything that is not a year pair", () => {
    for (const bad of ["2026", "2026-2027", "next year", "", null, undefined]) {
      expect(parseSessionName(bad)).toBeNull();
    }
  });
});

describe("what a session name means in days", () => {
  it("runs April to March for a Pakistani school", () => {
    const span = defaultSpan("2026-27", 4);
    expect(iso(span.startsOn)).toBe("2026-04-01");
    expect(iso(span.endsOn)).toBe("2027-03-31");
  });

  /**
   * The whole reason this is per-school. April-to-March is the common Pakistani
   * year, but Karachi and Cambridge-track schools commonly run August-to-July,
   * and the same name has to be able to mean their year too.
   */
  it("runs August to July for a school that says so", () => {
    const span = defaultSpan("2026-27", 8);
    expect(iso(span.startsOn)).toBe("2026-08-01");
    expect(iso(span.endsOn)).toBe("2027-07-31");
  });

  it("ends the day before it began a year later, leap year or not", () => {
    // 2027-28 spans 29 Feb 2028.
    const span = defaultSpan("2027-28", 4);
    expect(iso(span.startsOn)).toBe("2027-04-01");
    expect(iso(span.endsOn)).toBe("2028-03-31");
  });

  it("pins its edges at UTC midnight, so a server's zone cannot move them", () => {
    const span = defaultSpan("2026-27", 4);
    expect(span.startsOn.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("deciding which session a date falls in", () => {
  const sessions = [
    { name: "2025-26", ...defaultSpan("2025-26", 4) },
    { name: "2026-27", ...defaultSpan("2026-27", 4) },
  ];

  it("places a date inside the right year", () => {
    expect(sessionForDate(sessions, day("2026-05-25")).name).toBe("2026-27");
    expect(sessionForDate(sessions, day("2026-03-31")).name).toBe("2025-26");
  });

  it("includes both edges", () => {
    expect(sessionForDate(sessions, day("2026-04-01")).name).toBe("2026-27");
    expect(sessionForDate(sessions, day("2027-03-31")).name).toBe("2026-27");
  });

  it("says nothing rather than guessing when a date falls outside them all", () => {
    expect(sessionForDate(sessions, day("2020-01-01"))).toBeNull();
    expect(sessionForDate(sessions, day("2030-01-01"))).toBeNull();
  });

  /**
   * The same date under an August school lands in a different year — which is
   * exactly why a single platform-wide rule could not have worked.
   */
  it("gives a different answer for a school whose year opens in August", () => {
    const august = [
      { name: "2025-26", ...defaultSpan("2025-26", 8) },
      { name: "2026-27", ...defaultSpan("2026-27", 8) },
    ];
    expect(sessionForDate(august, day("2026-05-25")).name).toBe("2025-26");
    expect(sessionForDate(sessions, day("2026-05-25")).name).toBe("2026-27");
  });
});

/**
 * Naming the session a date falls in, without needing the row to exist.
 *
 * This is what lets a backfill say "these marks belong to 2025-26" about a year
 * the school has no record of yet — a derivation from the date itself. It is
 * the difference between deriving a historical session and defaulting one.
 */
describe("naming the session a date falls in", () => {
  it("names the year a date belongs to under an April school", () => {
    expect(sessionNameForDate(day("2026-05-25"), 4)).toBe("2026-27");
    expect(sessionNameForDate(day("2026-04-01"), 4)).toBe("2026-27");
    // Before the opening month, the school is still in the year that began last
    // calendar year.
    expect(sessionNameForDate(day("2027-03-31"), 4)).toBe("2026-27");
    expect(sessionNameForDate(day("2026-03-31"), 4)).toBe("2025-26");
  });

  it("gives a different year for the same date under an August school", () => {
    // The single fact that a blanket default could never have accounted for.
    expect(sessionNameForDate(day("2026-05-25"), 4)).toBe("2026-27");
    expect(sessionNameForDate(day("2026-05-25"), 8)).toBe("2025-26");
    expect(sessionNameForDate(day("2026-08-01"), 8)).toBe("2026-27");
  });

  it("reads the date in UTC, so a server's zone cannot move it a year", () => {
    // 23:00 UTC on 31 March is still 2025-26 for an April school, however far
    // east the server happens to sit.
    expect(sessionNameForDate(new Date("2026-03-31T23:00:00.000Z"), 4)).toBe("2025-26");
    expect(sessionNameForDate(new Date("2026-04-01T00:00:00.000Z"), 4)).toBe("2026-27");
  });

  it("agrees with the span it names", () => {
    for (const startMonth of [4, 8]) {
      for (const iso of ["2026-01-15", "2026-04-01", "2026-07-31", "2026-08-01", "2027-03-31"]) {
        const name = sessionNameForDate(day(iso), startMonth);
        const span = defaultSpan(name, startMonth);
        expect(sessionForDate([{ name, ...span }], day(iso))?.name,
          `${iso} at month ${startMonth}`).toBe(name);
      }
    }
  });

  it("says nothing for a date it cannot read", () => {
    expect(sessionNameForDate("not a date", 4)).toBeNull();
    expect(sessionNameForDate(new Date("nonsense"), 4)).toBeNull();
  });
});

describe("a school's session over the API", () => {
  it("has dates the first time it is asked, without anyone creating one", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/institutes/me/session");
    expect(res.status).toBe(200);

    expect(res.body.data.currentSession).toBe("2026-27");
    expect(res.body.data.current.name).toBe("2026-27");
    expect(iso(res.body.data.current.startsOn)).toBe("2026-04-01");
    expect(iso(res.body.data.current.endsOn)).toBe("2027-03-31");
    expect(res.body.data.suggestedNext).toBe("2027-28");
  });

  /**
   * The path the backfill script leans on.
   *
   * A row can exist under the school's own session name without being flagged
   * current — the backfill creates past years unflagged, and a school whose
   * current year was written that way would otherwise have `currentSession`
   * naming a session that no row claims. Adopting the named row is what keeps
   * the string and the row from drifting apart.
   */
  it("adopts a row already named after the school's session rather than making a second", async () => {
    if (skip()) return;
    const current = await prismaRaw.academicSession.findFirst({
      where: { instituteId: instId, isCurrent: true },
    });
    await prismaRaw.academicSession.update({
      where: { id: current.id }, data: { isCurrent: false },
    });

    const res = await as(admin).get("/api/institutes/me/session");
    expect(res.status).toBe(200);
    expect(res.body.data.current.id).toBe(current.id);

    const rows = await prismaRaw.academicSession.findMany({ where: { instituteId: instId } });
    expect(rows.filter((r) => r.isCurrent).map((r) => r.id)).toEqual([current.id]);
    expect(rows.filter((r) => r.name === current.name)).toHaveLength(1);
  });

  it("keeps the same row on a second ask rather than making another", async () => {
    if (skip()) return;
    const first = (await as(admin).get("/api/institutes/me/session")).body.data.current.id;
    const second = (await as(admin).get("/api/institutes/me/session")).body.data.current.id;
    expect(second).toBe(first);
    expect(await prismaRaw.academicSession.count({ where: { instituteId: instId } })).toBe(1);
  });

  it("moves to the next session and keeps the name and the row in step", async () => {
    if (skip()) return;
    const res = await as(admin).patch("/api/institutes/me/session").send({ currentSession: "2027-28" });
    expect(res.status).toBe(200);

    const institute = await prismaRaw.institute.findUnique({
      where: { id: instId }, select: { currentSession: true },
    });
    const sessions = await prismaRaw.academicSession.findMany({
      where: { instituteId: instId }, orderBy: { startsOn: "asc" },
    });

    // The string exists only to mirror the row; they are written together.
    expect(institute.currentSession).toBe("2027-28");
    expect(sessions.map((s) => s.name)).toEqual(["2026-27", "2027-28"]);
    expect(sessions.filter((s) => s.isCurrent).map((s) => s.name)).toEqual(["2027-28"]);
    expect(iso(sessions[1].startsOn)).toBe("2027-04-01");
  });

  it("leaves last year's dates alone when the school moves back into it", async () => {
    if (skip()) return;
    const before = await prismaRaw.academicSession.findFirst({
      where: { instituteId: instId, name: "2026-27" },
    });

    await as(admin).patch("/api/institutes/me/session").send({ currentSession: "2026-27" });

    const after = await prismaRaw.academicSession.findFirst({
      where: { instituteId: instId, name: "2026-27" },
    });
    expect(after.startsOn).toEqual(before.startsOn);
    expect(after.endsOn).toEqual(before.endsOn);
    expect(after.isCurrent).toBe(true);

    // Exactly one session is ever current.
    expect(await prismaRaw.academicSession.count({ where: { instituteId: instId, isCurrent: true } })).toBe(1);

    await as(admin).patch("/api/institutes/me/session").send({ currentSession: "2027-28" });
  });

  it("refuses a name that is not a year pair, and changes nothing", async () => {
    if (skip()) return;
    const before = await prismaRaw.academicSession.count({ where: { instituteId: instId } });

    for (const bad of ["2027", "next year", "2027-2028", "2027-29", ""]) {
      expect((await as(admin).patch("/api/institutes/me/session").send({ currentSession: bad })).status,
        `${bad} should be refused`).toBe(400);
    }

    expect(await prismaRaw.academicSession.count({ where: { instituteId: instId } })).toBe(before);
    const institute = await prismaRaw.institute.findUnique({
      where: { id: instId }, select: { currentSession: true },
    });
    expect(institute.currentSession).toBe("2027-28");
  });
});

describe("a school setting its own year", () => {
  it("accepts August-to-July dates for a session", async () => {
    if (skip()) return;
    const res = await as(admin).patch("/api/institutes/me/session").send({
      currentSession: "2028-29",
      startsOn: "2028-08-01",
      endsOn: "2029-07-31",
    });
    expect(res.status).toBe(200);
    expect(iso(res.body.data.session.startsOn)).toBe("2028-08-01");
    expect(iso(res.body.data.session.endsOn)).toBe("2029-07-31");
  });

  it("adjusts an existing session's dates without changing which is current", async () => {
    if (skip()) return;
    const target = await prismaRaw.academicSession.findFirst({
      where: { instituteId: instId, name: "2026-27" },
    });

    // The ordinary correction: a school whose year actually opened a fortnight
    // late and closed early. It stays inside the gap before 2027-28.
    const res = await as(admin).patch(`/api/institutes/me/sessions/${target.id}`).send({
      startsOn: "2026-04-15", endsOn: "2027-03-20",
    });
    expect(res.status).toBe(200);
    expect(iso(res.body.data.startsOn)).toBe("2026-04-15");
    expect(iso(res.body.data.endsOn)).toBe("2027-03-20");

    const current = await prismaRaw.academicSession.findFirst({
      where: { instituteId: instId, isCurrent: true }, select: { name: true },
    });
    expect(current.name).toBe("2028-29");
  });

  /**
   * Overlapping years would make "which session does this date belong to"
   * ambiguous again — the exact problem this table exists to remove.
   */
  it("refuses dates that overlap another session", async () => {
    if (skip()) return;
    const target = await prismaRaw.academicSession.findFirst({
      where: { instituteId: instId, name: "2027-28" },
    });

    const res = await as(admin).patch(`/api/institutes/me/sessions/${target.id}`).send({
      startsOn: "2026-09-01", endsOn: "2027-08-31",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/overlap/i);
  });

  it("refuses a session that ends before it starts", async () => {
    if (skip()) return;
    const target = await prismaRaw.academicSession.findFirst({
      where: { instituteId: instId, name: "2027-28" },
    });
    const res = await as(admin).patch(`/api/institutes/me/sessions/${target.id}`).send({
      startsOn: "2027-08-01", endsOn: "2027-04-01",
    });
    expect(res.status).toBe(400);
  });
});

describe("who may change a school's year", () => {
  it("is closed to another school's admin", async () => {
    if (skip()) return;
    const other = await makeSchool("other");
    if (!other.token) return;

    const mine = await prismaRaw.academicSession.findFirst({ where: { instituteId: instId } });
    const res = await as(other.token).patch(`/api/institutes/me/sessions/${mine.id}`).send({
      startsOn: "2026-01-01", endsOn: "2026-12-31",
    });
    // Scoped to the caller's own institute, so it simply is not there.
    expect(res.status).toBe(404);
  });

  it("is closed to an unauthenticated caller", async () => {
    if (skip()) return;
    const res = await request(app).patch("/api/institutes/me/session").send({ currentSession: "2030-31" });
    expect(res.status).toBe(401);
  });

  it("never touches a seeded demo school", async () => {
    if (skip()) return;
    const demo = await prismaRaw.institute.findFirst({
      where: { name: "Beaconhouse School" }, select: { id: true, currentSession: true },
    });
    expect(demo.currentSession).toBe("2026-27");
    // This spec created no session row for anybody but its own schools.
    const strays = await prismaRaw.academicSession.count({
      where: { instituteId: demo.id, createdAt: { gte: new Date(stamp) } },
    });
    expect(strays).toBe(0);
  });
});
