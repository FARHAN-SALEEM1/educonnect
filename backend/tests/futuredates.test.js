import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Nothing may be recorded as having happened on a day that has not happened.
 *
 * Found by probing a throwaway school: every date field in the product took
 * whatever it was given. Attendance for 2099 was accepted, and the damage was
 * quiet rather than loud —
 *
 *     attendance summary   5 days, 100%    <- counted 2099 and 2020
 *     result card          2 days          <- session-scoped, so it did not
 *
 * — two screens giving two different answers for one student, with nothing on
 * either of them naming the cause. Typing 2027 for 2026 is one keystroke, and
 * a Pakistani April–March session changes year mid-session, so it is a
 * keystroke people get wrong.
 *
 * These also pin the other half: the guard must not refuse work a school
 * actually does. Marking today has to keep working in the school's own
 * timezone, and a fee due next month is the normal case, not an error.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "FutureDates123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

/**
 * Calendar dates in the school's timezone, not the server's.
 *
 * The institute runs Asia/Karachi (UTC+5). Between 00:00 and 05:00 there the
 * UTC date is still yesterday, so building "today" from the server clock would
 * make this spec disagree with the code it is checking — and it would do so
 * for five hours a day, which is exactly the kind of test that passes on a
 * laptop and fails at night in CI.
 */
const TZ = "Asia/Karachi";
const dayIn = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86_400_000));

const TODAY = dayIn(0);
const TOMORROW = dayIn(1);
const YESTERDAY = dayIn(-1);

let sa, admin, instId, student, subject;
let seeded = true;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `future.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Future School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `future.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "Future Admin",
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
      code: `FD-${stamp}`,
    })
  ).body.data;
  student = (
    await as(admin).post("/api/students").send({
      name: "Future Student",
      grade: "Grade 8",
      section: "A",
      rollNo: `FD-${stamp}`,
    })
  ).body.data;
  await as(admin)
    .post("/api/subjects/enroll")
    .send({ studentId: student.id, subjectId: subject.id });
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

describe("a register cannot be taken for a day that has not happened", () => {
  it("refuses tomorrow — the off-by-one a night-shift clock would excuse", async () => {
    if (skip()) return;
    const res = await as(admin)
      .post("/api/attendance")
      .send({ studentId: student.id, date: TOMORROW, status: "PRESENT" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/future/i);
    // The rejected date is named, so a teacher can see what they typed.
    expect(res.body.message).toContain(TOMORROW);
  });

  it("refuses the year typo, on the bulk register the teacher portal uses", async () => {
    if (skip()) return;
    const res = await as(admin)
      .post("/api/attendance/bulk")
      .send({ date: "2099-01-01", records: [{ studentId: student.id, status: "PRESENT" }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/future/i);
  });

  it("writes nothing when it refuses", async () => {
    if (skip()) return;
    await as(admin)
      .post("/api/attendance/bulk")
      .send({ date: "2033-06-05", records: [{ studentId: student.id, status: "ABSENT" }] });

    const rows = await prismaRaw.attendance.findMany({
      where: { studentId: student.id, date: { gt: new Date(`${TOMORROW}T00:00:00.000Z`) } },
    });
    expect(rows, "a refused register must not leave a row behind").toEqual([]);
  });
});

describe("the guard does not get in a real school's way", () => {
  it("still accepts today, resolved in the school's timezone", async () => {
    if (skip()) return;
    const res = await as(admin)
      .post("/api/attendance/bulk")
      .send({ date: TODAY, records: [{ studentId: student.id, status: "PRESENT" }] });

    expect(res.status, res.body.message).toBe(201);
  });

  it("still accepts a past day, so a missed register can be filled in", async () => {
    if (skip()) return;
    const res = await as(admin)
      .post("/api/attendance")
      .send({ studentId: student.id, date: YESTERDAY, status: "LATE" });

    expect(res.status, res.body.message).toBe(201);
  });

  /**
   * The bug's actual symptom, pinned directly: the summary and the result card
   * are scoped differently, so a phantom future row inflated one and not the
   * other. With the guard there is no phantom row to disagree about.
   */
  it("leaves the attendance summary counting only real days", async () => {
    if (skip()) return;
    await as(admin)
      .post("/api/attendance/bulk")
      .send({ date: "2099-01-01", records: [{ studentId: student.id, status: "PRESENT" }] });

    const res = await as(admin).get(`/api/attendance/summary?studentId=${student.id}`);
    expect(res.body.data.total).toBe(2); // today and yesterday, and nothing else
  });
});

/**
 * These two refuse with 422, not the 400 the attendance guards return, and the
 * difference is real rather than an inconsistency to tidy away: a date that can
 * only ever be in the past is decidable from the request alone, so it is a
 * schema rule. Attendance is not — it needs the institute's timezone to know
 * what "today" is there — so it is enforced in the controller, which is where
 * this codebase raises 400.
 */
describe("the same rule where a date can only be in the past", () => {
  it("refuses a paper that has not been sat", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/assessments").send({
      studentId: student.id,
      subjectId: subject.id,
      title: "Mid Term",
      type: "EXAM",
      obtained: 50,
      total: 100,
      takenOn: "2099-01-01",
    });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/future/i);
  });

  it("refuses a child born in the future", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students").send({
      name: "Unborn",
      grade: "Grade 8",
      section: "A",
      rollNo: `FD-DOB-${stamp}`,
      dob: "2099-01-01",
    });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/future/i);
  });
});

/**
 * The other direction, and the reason this is a separate block: a blanket
 * "no future dates" rule would be its own bug. These fields point forward by
 * design, and a later tidy-up that "makes them consistent" would break issuing
 * a fee and scheduling a notice.
 */
describe("dates that are supposed to point forward still do", () => {
  it("issues a fee due next month", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/fees").send({
      studentId: student.id,
      period: "2026-09",
      amount: 5000,
      dueDate: dayIn(30),
    });

    expect(res.status, res.body.message).toBe(201);
  });

  it("accepts a notice that expires later", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/notices").send({
      title: "Sports Day",
      body: "Bring your kit.",
      audience: ["PARENT", "TEACHER"],
      expiresAt: dayIn(14),
    });

    expect(res.status, res.body.message).toBe(201);
  });
});
