import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Academic classes and timetable scheduling.
 *
 * Everything created here is torn down afterwards, and nothing touches the
 * seeded classes (8A/9B), their 60 timetable slots, or any student's
 * grade/section — the tests that need a roster read the seeded one rather than
 * moving anyone into it.
 *
 * The invariant worth stating: a class is metadata, and its roster is derived
 * from Student.grade/section. Several tests below exist to prove those two
 * stay in step.
 */

const YEAR = "2099-00"; // far enough out that it cannot collide with real data
const created = { classes: [], slots: [] };

let admin = null;
let teacher = null;
let parent = null;
let superadmin = null;
let otherAdmin = null;
let subjectId = null;
let teacherId = null;
// A second subject whose teacher differs, so a test can isolate the class or
// room dimension without the teacher check firing first.
let otherSubjectId = null;

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};

const ready = () => Boolean(admin && subjectId);

const asAdmin = (method, url) => request(app)[method](url).set("Authorization", `Bearer ${admin}`);

/**
 * Unique per call. Sharing a default name/section across tests made them clash
 * with each other on the duplicate-name rule rather than on what was under
 * test.
 */
let seq = 0;
const uniq = () => `${Date.now().toString().slice(-5)}${(seq += 1)}`;

const makeClass = async (over = {}) => {
  const u = uniq();
  const res = await asAdmin("post", "/api/classes").send({
    name: `QA${u}`,
    section: "Z",
    code: `QA-${u}`,
    academicYear: YEAR,
    ...over,
  });
  if (res.body?.data?.id) created.classes.push(res.body.data.id);
  return res;
};

/**
 * Each test gets its own hour on Saturday/Sunday, well clear of the seeded
 * Mon–Fri 08:00–12:50 grid and of every other test. Without this the suite
 * detects real conflicts between unrelated tests, which is the engine working
 * and the fixtures failing.
 */
let block = 0;
const window = () => {
  // 30-minute blocks from 06:00, 20-minute slots inside them so consecutive
  // blocks never touch. Saturday first, then Sunday — 60 distinct windows,
  // comfortably more than this file needs.
  const n = block++;
  const perDay = 30;
  const day = 6 + Math.floor(n / perDay);
  const minutes = 6 * 60 + (n % perDay) * 30;
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const endM = minutes + 20;
  return {
    dayOfWeek: day,
    startTime: `${hh}:${mm}`,
    endTime: `${String(Math.floor(endM / 60)).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`,
  };
};

const makeSlot = (over = {}) =>
  asAdmin("post", "/api/timetable/schedule").send({
    subjectId,
    ...window(),
    ...over,
  });

const track = (res) => {
  if (res.body?.data?.id) created.slots.push(res.body.data.id);
  return res;
};

beforeAll(async () => {
  [admin, teacher, parent, superadmin] = await Promise.all([
    login("admin@bhs.edu", "admin123"),
    login("hassan@bhs.edu", "teach123"),
    login("sara@gmail.com", "parent123"),
    login("sa@educonnect.io", "super123"),
  ]);

  const subjects = await prismaRaw.subject.findMany({
    where: { institute: { code: "INS001" }, teacherId: { not: null } },
    select: { id: true, teacherId: true },
  });
  subjectId = subjects[0]?.id ?? null;
  teacherId = subjects[0]?.teacherId ?? null;
  otherSubjectId = subjects.find((s) => s.teacherId !== teacherId)?.id ?? null;

  // An admin at a different institute, for cross-tenant checks.
  const other = await prismaRaw.user.findFirst({
    where: { role: "ADMIN", institute: { code: "INS002" } },
    select: { email: true },
  });
  if (other) otherAdmin = await login(other.email, "admin123");
});

afterAll(async () => {
  if (created.slots.length) {
    await prismaRaw.timetableSlot.deleteMany({ where: { id: { in: created.slots } } });
  }
  if (created.classes.length) {
    await prismaRaw.academicClass.deleteMany({ where: { id: { in: created.classes } } });
  }
  // Belt and braces: nothing from this file may survive under the test year.
  await prismaRaw.timetableSlot.deleteMany({ where: { academicYear: YEAR } });
  await prismaRaw.academicClass.deleteMany({ where: { academicYear: YEAR } });
});

describe("class management", () => {
  it("creates a class with the school's own naming", async () => {
    if (!ready()) return;
    const res = await makeClass({ name: "BSCS", section: "3", code: "LB3-101", room: "Lab 101" });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("BSCS");
    expect(res.body.data.code).toBe("LB3-101");
    expect(res.body.data.room).toBe("Lab 101");
  });

  it("edits a class", async () => {
    if (!ready()) return;
    const made = await makeClass();
    const res = await asAdmin("patch", `/api/classes/${made.body.data.id}`).send({ room: "Room 204" });
    expect(res.status).toBe(200);
    expect(res.body.data.room).toBe("Room 204");
  });

  /** Archive, not delete — a class is referenced by history. */
  it("archives and restores instead of deleting", async () => {
    if (!ready()) return;
    const made = await makeClass();
    const id = made.body.data.id;

    const archived = await asAdmin("patch", `/api/classes/${id}/archive`).send({});
    expect(archived.status).toBe(200);
    expect(archived.body.data.isArchived).toBe(true);

    // Gone from the default list, still in the database.
    const list = await asAdmin("get", `/api/classes?academicYear=${YEAR}`);
    expect(list.body.data.some((c) => c.id === id)).toBe(false);
    expect(await prismaRaw.academicClass.count({ where: { id } })).toBe(1);

    const withArchived = await asAdmin("get", `/api/classes?academicYear=${YEAR}&includeArchived=true`);
    expect(withArchived.body.data.some((c) => c.id === id)).toBe(true);

    const restored = await asAdmin("patch", `/api/classes/${id}/archive`).send({ isArchived: false });
    expect(restored.body.data.isArchived).toBe(false);
  });

  it("refuses a duplicate class code within the same year", async () => {
    if (!ready()) return;
    const code = `DUP-${Date.now().toString().slice(-6)}`;
    const first = await makeClass({ code, section: "A" });
    expect(first.status).toBe(201);

    const second = await makeClass({ code, section: "B" });
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already used/i);
  });

  it("refuses a duplicate name and section within the same year", async () => {
    if (!ready()) return;
    const name = `QA-${Date.now().toString().slice(-6)}`;
    expect((await makeClass({ name, section: "A" })).status).toBe(201);
    const second = await makeClass({ name, section: "A" });
    expect(second.status).toBe(409);
  });

  /** The same code in a later year is normal school practice, not a clash. */
  it("allows the same code in a different academic year", async () => {
    if (!ready()) return;
    const code = `YR-${Date.now().toString().slice(-6)}`;
    expect((await makeClass({ code })).status).toBe(201);
    const nextYear = await makeClass({ code, academicYear: "2098-99" });
    expect(nextYear.status).toBe(201);
    if (nextYear.body?.data?.id) created.classes.push(nextYear.body.data.id);
    await prismaRaw.academicClass.deleteMany({ where: { academicYear: "2098-99" } });
  });

  it("reports the roster and teaching load from live data", async () => {
    if (!ready()) return;
    const list = await asAdmin("get", "/api/classes");
    const eightA = list.body.data.find((c) => c.code === "8A");
    if (!eightA) return;

    /**
     * Counted, not hardcoded.
     *
     * This test used to assert the seed's three students and thirty slots
     * outright, which made it a test of the demo data rather than of the
     * endpoint — adding a student through the app broke it. What it is actually
     * for is that the counts follow the database, so that is what it checks.
     */
    const [students, slots] = await Promise.all([
      prismaRaw.student.count({
        where: {
          institute: { code: "INS001" },
          grade: eightA.name,
          section: eightA.section,
          deletedAt: null,
          status: "ACTIVE",
        },
      }),
      prismaRaw.timetableSlot.count({
        where: { institute: { code: "INS001" }, grade: eightA.name, section: eightA.section },
      }),
    ]);

    expect(eightA.studentCount).toBe(students);
    expect(eightA.slotCount).toBe(slots);
    // and it is a real class, not an empty one that trivially matches
    expect(students).toBeGreaterThan(0);
    expect(slots).toBeGreaterThan(0);
  });
});

describe("assigning students to a class", () => {
  it("moves a student and keeps grade/section in step", async () => {
    if (!ready()) return;
    const student = await prismaRaw.student.findFirst({
      where: { institute: { code: "INS001" }, deletedAt: null },
      select: { id: true, grade: true, section: true },
    });
    if (!student) return;

    const made = await makeClass({ name: "QA Move", section: "M" });
    const res = await asAdmin("post", `/api/classes/${made.body.data.id}/students`).send({
      studentIds: [student.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.studentCount).toBe(1);

    const moved = await prismaRaw.student.findUnique({ where: { id: student.id } });
    expect(moved.grade).toBe("QA Move");
    expect(moved.section).toBe("M");

    // Put them back exactly where they were.
    await prismaRaw.student.update({
      where: { id: student.id },
      data: { grade: student.grade, section: student.section },
    });
  });

  it("refuses a student from another institute", async () => {
    if (!ready()) return;
    const foreign = await prismaRaw.student.findFirst({
      where: { institute: { code: { not: "INS001" } } },
      select: { id: true },
    });
    const made = await makeClass({ name: "QA Foreign", section: "F" });
    const res = await asAdmin("post", `/api/classes/${made.body.data.id}/students`).send({
      studentIds: [foreign?.id ?? "no-such-student"],
    });
    expect(res.status).toBe(400);
  });
});

describe("authorization and tenancy", () => {
  it("lets a teacher read classes but not create one", async () => {
    if (!ready() || !teacher) return;
    expect((await request(app).get("/api/classes").set("Authorization", `Bearer ${teacher}`)).status).toBe(200);

    const res = await request(app).post("/api/classes").set("Authorization", `Bearer ${teacher}`).send({
      name: "Teacher Made", section: "X", code: "TX-1", academicYear: YEAR,
    });
    expect(res.status).toBe(403);
  });

  it("lets a parent read but not create", async () => {
    if (!ready() || !parent) return;
    const res = await request(app).post("/api/classes").set("Authorization", `Bearer ${parent}`).send({
      name: "Parent Made", section: "X", code: "PX-1", academicYear: YEAR,
    });
    expect(res.status).toBe(403);
  });

  it("refuses an unauthenticated caller", async () => {
    expect((await request(app).get("/api/classes")).status).toBe(401);
  });

  /** Out of scope reads 404, not 403 — an id must not be probeable. */
  it("hides another institute's class from an admin", async () => {
    if (!ready() || !otherAdmin) return;
    const mine = await makeClass({ name: "QA Tenant", section: "T" });
    const res = await request(app)
      .get(`/api/classes/${mine.body.data.id}`)
      .set("Authorization", `Bearer ${otherAdmin}`);
    expect(res.status).toBe(404);
  });

  it("refuses to schedule into another institute's class", async () => {
    if (!ready() || !otherAdmin) return;
    const mine = await makeClass({ name: "QA Tenant2", section: "T" });
    const res = await request(app)
      .post("/api/timetable/schedule")
      .set("Authorization", `Bearer ${otherAdmin}`)
      .send({ classId: mine.body.data.id, subjectId, dayOfWeek: 3, startTime: "14:00", endTime: "15:00" });
    expect([400, 403, 404]).toContain(res.status);
  });
});

describe("timetable scheduling and conflicts", () => {
  it("creates a slot", async () => {
    if (!ready()) return;
    const cls = await makeClass({ room: "QA Room 1" });
    const w = window();
    const res = track(await makeSlot({ classId: cls.body.data.id, ...w }));
    expect(res.status).toBe(201);
    expect(res.body.data.startTime).toBe(w.startTime);
    // grade/section are mirrored so the rest of the app can find it.
    expect(res.body.data.grade).toBe(cls.body.data.name);
    expect(res.body.data.section).toBe(cls.body.data.section);
  });

  it("edits a slot", async () => {
    if (!ready()) return;
    const cls = await makeClass();
    const made = track(await makeSlot({ classId: cls.body.data.id }));
    const res = await asAdmin("patch", `/api/timetable/schedule/${made.body.data.id}`).send({
      room: `Moved ${uniq()}`,
    });
    expect(res.status, res.body.message).toBe(200);
    expect(res.body.data.room).toMatch(/^Moved/);
  });

  it("deletes a slot", async () => {
    if (!ready()) return;
    const cls = await makeClass();
    const made = track(await makeSlot({ classId: cls.body.data.id }));
    const res = await asAdmin("delete", `/api/timetable/${made.body.data.id}`);
    expect(res.status).toBe(200);
    expect(await prismaRaw.timetableSlot.count({ where: { id: made.body.data.id } })).toBe(0);
  });

  it("detects a TEACHER conflict", async () => {
    if (!ready() || !teacherId) return;
    const a = await makeClass({ room: `TA ${uniq()}` });
    const b = await makeClass({ room: `TB ${uniq()}` });
    const w = window();

    const first = track(await makeSlot({ classId: a.body.data.id, teacherId, ...w }));
    expect(first.status).toBe(201);

    // Different class, different room — only the teacher is shared.
    const clash = track(await makeSlot({ classId: b.body.data.id, teacherId, ...w }));
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/Teacher Conflict/);
  });

  /** Same class, overlapping times, deliberately different teacher and room. */
  it("detects a CLASS conflict", async () => {
    if (!ready() || !otherSubjectId) return;
    const cls = await makeClass();
    const w = window();

    const first = track(await makeSlot({ classId: cls.body.data.id, ...w, room: `CC1 ${uniq()}` }));
    expect(first.status).toBe(201);

    const clash = track(await makeSlot({
      classId: cls.body.data.id,
      subjectId: otherSubjectId,
      dayOfWeek: w.dayOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
      room: `CC2 ${uniq()}`,
    }));
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/Class Conflict/);
  });

  /** Same room, different class, deliberately different teacher. */
  it("detects a ROOM conflict", async () => {
    if (!ready() || !otherSubjectId) return;
    const a = await makeClass();
    const b = await makeClass();
    const room = `Shared Lab ${uniq()}`;
    const w = window();

    const first = track(await makeSlot({ classId: a.body.data.id, room, ...w }));
    expect(first.status).toBe(201);

    const clash = track(await makeSlot({
      classId: b.body.data.id, subjectId: otherSubjectId, room, ...w,
    }));
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/Room Conflict/);
  });

  it("treats a room name as the same room whatever its casing", async () => {
    if (!ready() || !otherSubjectId) return;
    const a = await makeClass();
    const b = await makeClass();
    const room = `Lab ${uniq()}`;
    const w = window();

    track(await makeSlot({ classId: a.body.data.id, room: room.toUpperCase(), ...w }));
    const clash = track(await makeSlot({
      classId: b.body.data.id, subjectId: otherSubjectId, room: room.toLowerCase(), ...w,
    }));
    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/Room Conflict/);
  });

  /**
   * The case that matters most in daily use: a normal back-to-back timetable
   * must be enterable. Ranges are half-open, so 14:00–15:00 and 15:00–16:00
   * touch without overlapping.
   */
  it("allows adjacent slots that touch but do not overlap", async () => {
    if (!ready() || !teacherId) return;
    const cls = await makeClass({ room: `Adj ${uniq()}` });

    // A quiet corner of the week, chosen so only these two slots live there.
    const first = track(await makeSlot({
      classId: cls.body.data.id, teacherId, dayOfWeek: 7, startTime: "22:00", endTime: "23:00",
    }));
    expect(first.status, first.body.message).toBe(201);

    const second = track(await makeSlot({
      classId: cls.body.data.id, teacherId, dayOfWeek: 7, startTime: "23:00", endTime: "23:59",
    }));
    expect(second.status, second.body.message).toBe(201);
  });

  it("refuses an end time at or before the start", async () => {
    if (!ready()) return;
    const cls = await makeClass();
    for (const [startTime, endTime] of [["15:00", "14:00"], ["15:00", "15:00"]]) {
      const res = await makeSlot({ classId: cls.body.data.id, dayOfWeek: 6, startTime, endTime });
      expect(res.status).toBe(422);
    }
  });

  it("refuses a subject from another institute", async () => {
    if (!ready()) return;
    const foreignSubject = await prismaRaw.subject.findFirst({
      where: { institute: { code: { not: "INS001" } } },
      select: { id: true },
    });
    const cls = await makeClass();
    const res = await makeSlot({
      classId: cls.body.data.id,
      subjectId: foreignSubject?.id ?? "no-such-subject",
    });
    expect(res.status).toBe(400);
  });

  it("refuses scheduling into an archived class", async () => {
    if (!ready()) return;
    const cls = await makeClass();
    await asAdmin("patch", `/api/classes/${cls.body.data.id}/archive`).send({});
    const res = await makeSlot({ classId: cls.body.data.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/archived/i);
  });

  /** Update used to skip conflict checking entirely. */
  it("re-checks conflicts when a slot is edited into a clash", async () => {
    if (!ready() || !otherSubjectId) return;
    const cls = await makeClass();
    const w = window();

    const anchor = track(await makeSlot({ classId: cls.body.data.id, ...w, room: `UC1 ${uniq()}` }));
    expect(anchor.status, anchor.body.message).toBe(201);

    const parked = window();
    const movable = track(await makeSlot({
      classId: cls.body.data.id,
      subjectId: otherSubjectId,
      ...parked,
      room: `UC2 ${uniq()}`,
    }));
    expect(movable.status, movable.body.message).toBe(201);

    const res = await asAdmin("patch", `/api/timetable/schedule/${movable.body.data.id}`).send({
      startTime: w.startTime, endTime: w.endTime,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Class Conflict/);
  });

  it("does not report a slot as conflicting with itself", async () => {
    if (!ready()) return;
    const cls = await makeClass();
    const made = track(await makeSlot({ classId: cls.body.data.id }));
    expect(made.status, made.body.message).toBe(201);
    const res = await asAdmin("patch", `/api/timetable/schedule/${made.body.data.id}`).send({
      room: `Elsewhere ${uniq()}`,
    });
    expect(res.status, res.body.message).toBe(200);
  });

  it("refuses a teacher or parent creating a slot", async () => {
    if (!ready() || !teacher) return;
    const cls = await makeClass();
    for (const token of [teacher, parent].filter(Boolean)) {
      const res = await request(app)
        .post("/api/timetable/schedule")
        .set("Authorization", `Bearer ${token}`)
        .send({ classId: cls.body.data.id, subjectId, ...window() });
      expect(res.status).toBe(403);
    }
  });
});

describe("who sees which timetable", () => {
  it("gives a teacher only their own slots", async () => {
    if (!ready() || !teacher) return;
    const res = await request(app).get("/api/timetable").set("Authorization", `Bearer ${teacher}`);
    expect(res.status).toBe(200);

    const me = await prismaRaw.teacher.findFirst({ where: { user: { email: "hassan@bhs.edu" } } });
    const foreign = res.body.data.slots.filter((s) => s.teacher?.id && s.teacher.id !== me.id);
    expect(foreign, "a teacher must not see another teacher's schedule").toEqual([]);
    expect(res.body.data.slots.length).toBeGreaterThan(0);
  });

  it("gives a parent only their own child's class timetable", async () => {
    if (!ready() || !parent) return;
    const child = await prismaRaw.student.findFirst({
      where: { parent: { user: { email: "sara@gmail.com" } } },
      select: { id: true, grade: true, section: true },
    });
    if (!child) return;

    const res = await request(app)
      .get(`/api/students/${child.id}`)
      .set("Authorization", `Bearer ${parent}`);
    expect(res.status).toBe(200);

    const wrongClass = (res.body.data.timetable ?? []).filter(
      (s) => s.grade !== child.grade || s.section !== child.section
    );
    expect(wrongClass, "a parent must only see their child's class").toEqual([]);
  });

  /**
   * Scoping used to be conditional on the query string: a teacher was pinned to
   * their own slots only when they sent no filter, and a parent was never
   * scoped at all. So a single query parameter opened the whole institute's
   * timetable to either of them. These pin the rule that a filter may narrow
   * what a role can see and never widen it.
   */
  it("keeps a teacher on their own slots even when they filter by another class", async () => {
    if (!ready() || !teacher) return;
    const me = await prismaRaw.teacher.findFirst({ where: { user: { email: "hassan@bhs.edu" } } });

    for (const qs of ["", "?grade=Grade 9", "?grade=Grade 9&section=B", "?section=A"]) {
      const res = await request(app)
        .get(`/api/timetable${qs}`)
        .set("Authorization", `Bearer ${teacher}`);
      expect(res.status).toBe(200);
      const foreign = res.body.data.slots.filter((s) => s.teacher?.id && s.teacher.id !== me.id);
      expect(foreign, `"${qs}" exposed another teacher's schedule`).toEqual([]);
    }
  });

  it("ignores a teacherId a teacher supplies for somebody else", async () => {
    if (!ready() || !teacher) return;
    const me = await prismaRaw.teacher.findFirst({ where: { user: { email: "hassan@bhs.edu" } } });
    const other = await prismaRaw.teacher.findFirst({
      where: { instituteId: me.instituteId, id: { not: me.id } },
      select: { id: true },
    });
    if (!other) return;

    const res = await request(app)
      .get(`/api/timetable?teacherId=${other.id}`)
      .set("Authorization", `Bearer ${teacher}`);
    expect(res.status).toBe(200);
    const foreign = res.body.data.slots.filter((s) => s.teacher?.id && s.teacher.id !== me.id);
    expect(foreign).toEqual([]);
  });

  it("keeps a parent on their own children's classes, filter or not", async () => {
    if (!ready() || !parent) return;
    const children = await prismaRaw.student.findMany({
      where: { parent: { user: { email: "sara@gmail.com" } } },
      select: { grade: true, section: true },
    });
    if (!children.length) return;
    const mine = new Set(children.map((c) => `${c.grade}|${c.section}`));

    for (const qs of ["", "?grade=Grade 9", "?grade=Grade 9&section=B"]) {
      const res = await request(app)
        .get(`/api/timetable${qs}`)
        .set("Authorization", `Bearer ${parent}`);
      expect(res.status).toBe(200);
      const foreign = res.body.data.slots.filter((s) => !mine.has(`${s.grade}|${s.section}`));
      expect(foreign, `"${qs}" exposed another class to a parent`).toEqual([]);
    }
  });

  it("keeps the admin schedule view out of a teacher's reach", async () => {
    if (!ready() || !teacher) return;
    const res = await request(app)
      .get("/api/timetable/schedule")
      .set("Authorization", `Bearer ${teacher}`);
    expect(res.status).toBe(403);
  });

  it("filters the admin schedule by class", async () => {
    if (!ready()) return;
    const list = await asAdmin("get", "/api/classes");
    const eightA = list.body.data.find((c) => c.code === "8A");
    if (!eightA) return;

    const res = await asAdmin("get", `/api/timetable/schedule?classId=${eightA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(30);
    expect(res.body.data.every((s) => s.grade === "Grade 8" && s.section === "A")).toBe(true);
  });
});
