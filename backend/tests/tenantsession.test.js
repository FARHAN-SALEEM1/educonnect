import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { currentSession, readSessionId } from "../src/services/session.service.js";

/**
 * A teacher's own school decides which year they are looking at.
 *
 * `GET /dashboard/teacher` and `GET /teachers/me/classes` scope themselves by
 * the signed-in teacher, so neither runs scopeToInstitute and `req.instituteId`
 * is undefined on both. Both then asked for the current academic session with
 * exactly that. Prisma drops an undefined field from a where clause rather than
 * matching on it, so `{ instituteId: undefined, isCurrent: true }` asked for the
 * first current session of *any* institute — somebody else's year. The
 * teacher's enrolments were filtered against it, matched nothing, and every
 * teacher's dashboard reported zero classes and zero students while still
 * counting their subjects.
 *
 * It cannot happen on a database holding one school, which is to say it cannot
 * happen anywhere except production. Read-only: this file signs in and looks.
 */

let teacher, seeded = true;

const as = (t) => ({ get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`) });

beforeAll(async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "hassan@bhs.edu", password: "teach123" });
  teacher = res.status === 200 ? res.body.data.accessToken : null;
  if (!teacher) seeded = false;
}, 60_000);

const skip = () => !seeded;

it("built its fixtures", async () => {
  const { seedPresent } = await import("./helpers/fixtures.js");
  if (!(await seedPresent())) return;
  expect(seeded, "beforeAll did not complete — every test in this file is vacuous").toBe(true);
});

describe("asking for a session without naming a school", () => {
  it("comes back with nothing rather than someone else's year", async () => {
    if (skip()) return;

    // The guard is the point: with more than one school on the platform there
    // is always a current session to find, and it is never ours.
    const others = await prismaRaw.academicSession.count({ where: { isCurrent: true } });
    expect(others, "this only bites once a second school exists").toBeGreaterThan(0);

    expect(await currentSession(undefined)).toBeNull();
    expect(await currentSession(null)).toBeNull();
    expect(await readSessionId(undefined)).toBeNull();
  });
});

describe("what a teacher sees of their own classes", () => {
  it("counts the students they actually teach", async () => {
    if (skip()) return;
    const kpis = (await as(teacher).get("/api/dashboard/teacher")).body.data?.kpis;

    expect(kpis.subjects, "this teacher should have subjects to begin with").toBeGreaterThan(0);
    expect(kpis.students, "subjects but no students is the shape of the bug").toBeGreaterThan(0);
    expect(kpis.classes).toBeGreaterThan(0);
  });

  it("lists those classes on the classes screen too", async () => {
    if (skip()) return;
    const rows = (await as(teacher).get("/api/teachers/me/classes")).body.data ?? [];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((c) => (c.students ?? []).length > 0)).toBe(true);
  });

  it("agrees with itself about how many students that is", async () => {
    if (skip()) return;
    const kpis = (await as(teacher).get("/api/dashboard/teacher")).body.data?.kpis;
    const rows = (await as(teacher).get("/api/teachers/me/classes")).body.data ?? [];

    const onClasses = new Set(rows.flatMap((c) => (c.students ?? []).map((s) => s.id)));
    expect(onClasses.size, "the dashboard and the classes screen must not disagree").toBe(
      kpis.students
    );
  });
});
