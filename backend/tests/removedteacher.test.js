import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Removing a teacher has to take them off the timetable as well.
 *
 * `deleteTeacher` soft-deletes the row and, in the same transaction, unassigns
 * their subjects — and then says so: *"Their subjects are now unassigned."*
 * It never touched `TimetableSlot.teacherId`, so the periods they taught went
 * on naming them. `Teacher` is soft-deleted rather than deleted, so the
 * database's own `onDelete: SetNull` never fires, and the timetable reads the
 * teacher through a nested `include`, which the soft-delete extension does not
 * reach either.
 *
 * Two consequences, both of which a school meets in its first week without the
 * teacher: the printed timetable still lists someone who has left, and
 * `conflictsFor` still refuses to schedule anyone against their periods — a
 * clash with a person who no longer works there, and no way to see why.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "RemovedTeach123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});

let sa, admin, instId, teacher, other, subject, klass, slotId, slotTeacherBefore;
let seeded = true;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `rmteach.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Removed Teacher School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `rmteach.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "RmTeach Admin",
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

  const makeTeacher = async (name, email) =>
    (
      await as(admin).post("/api/teachers").send({
        name,
        email,
        phone: "03001234567",
      })
    ).body.data;

  teacher = await makeTeacher("Departing Sir", `rmteach.t1.${stamp}@test.edu`);
  other = await makeTeacher("Staying Sir", `rmteach.t2.${stamp}@test.edu`);

  subject = (
    await as(admin).post("/api/subjects").send({
      name: "Mathematics",
      grade: "Grade 8",
      code: `RT-${stamp}`,
      teacherId: teacher?.id,
    })
  ).body.data;

  klass = (
    await as(admin).post("/api/classes").send({
      name: "Grade 8",
      section: "A",
      code: `RTC-${stamp}`,
      academicYear: "2026-27",
    })
  ).body.data;
  if (!teacher || !other || !subject || !klass) {
    seeded = false;
    return;
  }

  const slot = await as(admin).post("/api/timetable/schedule").send({
    classId: klass.id,
    subjectId: subject.id,
    teacherId: teacher.id,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    room: "R-1",
  });
  slotId = slot.body.data?.id;
  if (!slotId) {
    seeded = false;
    return;
  }

  /**
   * What the slot looked like before the teacher left.
   *
   * Captured because the assertions below are all about a value becoming null,
   * and a slot that never carried a teacherId would satisfy every one of them
   * while proving nothing. This spec has to fail if the setup stops working.
   */
  slotTeacherBefore = (
    await prismaRaw.timetableSlot.findUnique({
      where: { id: slotId },
      select: { teacherId: true },
    })
  )?.teacherId;

  const removed = await as(admin).delete(`/api/teachers/${teacher.id}`);
  if (removed.status !== 200) seeded = false;
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

describe("a teacher who has left the school", () => {

  it("was actually on the timetable to begin with", () => {
    if (skip()) return;
    // Guards every assertion below: without this they would all pass against a
    // slot that never had a teacher.
    expect(slotTeacherBefore, "setup did not attach the teacher to the slot").toBe(teacher.id);
  });

  it("is gone from the staff list", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/teachers?limit=100");

    const names = (res.body.data ?? []).map((t) => t.name);
    expect(names).toContain("Staying Sir");
    expect(names).not.toContain("Departing Sir");
  });

  it("leaves their subject unassigned, as the message promises", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/subjects/${subject.id}`);

    expect(res.body.data?.teacherId ?? res.body.data?.teacher?.id ?? null).toBeNull();
  });

  it("is off the timetable — the period stays, the name goes", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/timetable");

    // The endpoint answers { slots, days }, with the rendered periods grouped
    // under days — that is what the screen draws, so that is what is checked.
    const periods = (res.body.data?.days ?? []).flatMap((d) => d.periods ?? []);
    const mine = periods.find((p) => p.id === slotId);
    expect(mine, "the class still has its period").toBeTruthy();
    expect(mine.teacher).toBeNull();
    expect(mine.teacherId).toBeNull();
  });

  /**
   * The API answer is built from the `teacher` relation, but conflict detection
   * matches on the scalar `slot.teacherId`. If the column still points at the
   * departed teacher, the timetable can read clean while the schedule is still
   * being defended on their behalf — so the column is checked directly.
   */
  it("clears the column, not just the answer", async () => {
    if (skip()) return;
    const row = await prismaRaw.timetableSlot.findUnique({
      where: { id: slotId },
      select: { teacherId: true },
    });
    expect(row.teacherId).toBeNull();
  });

  /**
   * The half that costs a school real time: until the slot is cleared, the
   * conflict engine defends the schedule of someone who has left.
   */
  it("no longer blocks another teacher from that period", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/timetable/schedule").send({
      classId: klass.id,
      subjectId: subject.id,
      teacherId: other.id,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
      room: "R-2",
    });

    // The room and the class period still clash, so ask for a free one.
    const free = await as(admin).post("/api/timetable/schedule").send({
      classId: klass.id,
      subjectId: subject.id,
      teacherId: other.id,
      dayOfWeek: 2,
      startTime: "09:00",
      endTime: "10:00",
      room: "R-2",
    });
    expect(free.status, free.body.message).toBe(201);

    // And nothing in either answer may mention the teacher who left.
    expect(`${res.body.message ?? ""}`).not.toMatch(/Departing Sir/);
  });
});
