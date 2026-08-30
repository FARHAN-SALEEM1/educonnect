import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { minutesOf } from "../validators/academic.schema.js";

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Do two time ranges overlap?
 *
 * Half-open on purpose: a slot occupies [start, end), so 08:00–09:00 and
 * 09:00–10:00 are adjacent, not overlapping. Getting this wrong makes a normal
 * back-to-back timetable impossible to enter, which is worse than missing a
 * genuine clash.
 */
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/**
 * Every reason this slot cannot be scheduled, in the school's own words.
 *
 * Compares real time ranges rather than period numbers. Rows that predate the
 * time-range fields have null start/end; those fall back to matching on the
 * period, so the original period-based guarantee still holds for old data
 * instead of being silently dropped.
 *
 * `ignoreId` lets an edit exclude the row being edited — without it, moving a
 * slot by five minutes would always report itself as a conflict.
 */
export async function conflictsFor({ instituteId, dayOfWeek, startTime, endTime, period, teacherId, room, grade, section, ignoreId = null }) {
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);

  // Anything that could possibly clash: same institute, same day.
  const sameDay = await prisma.timetableSlot.findMany({
    where: {
      instituteId,
      dayOfWeek,
      ...(ignoreId && { id: { not: ignoreId } }),
    },
    include: {
      subject: { select: { name: true } },
      teacher: { select: { id: true, name: true } },
    },
  });

  const collides = (slot) => {
    const sStart = minutesOf(slot.startTime);
    const sEnd = minutesOf(slot.endTime);
    // Old rows without a range: fall back to the period they occupy.
    if (sStart === null || sEnd === null || start === null || end === null) {
      return period != null && slot.period === period;
    }
    return overlaps(start, end, sStart, sEnd);
  };

  const found = [];

  for (const slot of sameDay) {
    if (!collides(slot)) continue;
    const when = slot.startTime && slot.endTime ? `${slot.startTime}–${slot.endTime}` : `period ${slot.period}`;

    if (teacherId && slot.teacherId === teacherId) {
      found.push({
        type: "TEACHER",
        message: `Teacher Conflict: ${slot.teacher?.name ?? "That teacher"} is already scheduled for ${slot.grade}-${slot.section} (${slot.subject.name}) at ${when}.`,
      });
    }
    if (grade && section && slot.grade === grade && slot.section === section) {
      found.push({
        type: "CLASS",
        message: `Class Conflict: ${grade}-${section} already has ${slot.subject.name} scheduled at ${when}.`,
      });
    }
    // Rooms are free text; compare case-insensitively so "Lab 101" and
    // "lab 101" are understood to be the same room.
    if (room && slot.room && slot.room.trim().toLowerCase() === room.trim().toLowerCase()) {
      found.push({
        type: "ROOM",
        message: `Room Conflict: ${slot.room} is already occupied by ${slot.grade}-${slot.section} at ${when}.`,
      });
    }
  }

  // One message per kind — three identical teacher clashes help nobody.
  const seen = new Set();
  return found.filter((c) => !seen.has(c.type) && seen.add(c.type));
}

/**
 * GET /api/timetable?grade=&section=&teacherId=
 * Returns both the flat slot list and a day-grouped view, so the client
 * can render a grid without regrouping.
 */
export const getTimetable = asyncHandler(async (req, res) => {
  const { grade, section, teacherId } = req.query;

  /**
   * Role scoping is applied unconditionally, and query filters can only narrow
   * what it already allows.
   *
   * It used to hang off the query string — a teacher was pinned to their own
   * slots only `if (!grade && !teacherId)`, and a parent was never scoped at
   * all. So `?grade=Grade 9` handed a teacher every colleague's schedule, and a
   * parent calling this route plainly got the whole institute's timetable. The
   * portals never asked for either, which is exactly why it went unnoticed:
   * the UI was well behaved and the endpoint was not.
   */
  const scope = {};

  if (req.user.role === "TEACHER") {
    // A teacher sees their own teaching, whatever they filter by.
    scope.teacherId = req.user.teacherId;
  } else if (req.user.role === "PARENT") {
    // A parent sees the classes their own children sit in, and nothing else.
    const children = await prisma.student.findMany({
      where: { parentId: req.user.parentId, ...(req.instituteId && { instituteId: req.instituteId }) },
      select: { grade: true, section: true },
    });
    // No children on the account means no timetable, not the whole school.
    scope.OR = children.length
      ? children.map((c) => ({ grade: c.grade, section: c.section }))
      : [{ id: "__none__" }];
  }

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(grade && { grade }),
    ...(section && { section }),
    // An admin may filter by teacher; for a teacher their own id is already
    // pinned above and cannot be widened from the query string.
    ...(teacherId && req.user.role !== "TEACHER" && { teacherId }),
    ...scope,
  };

  const slots = await prisma.timetableSlot.findMany({
    where,
    include: {
      subject: { select: { id: true, name: true, color: true } },
      teacher: { select: { id: true, name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  const byDay = new Map();
  for (const slot of slots) {
    if (!byDay.has(slot.dayOfWeek)) {
      byDay.set(slot.dayOfWeek, { dayOfWeek: slot.dayOfWeek, day: DAYS[slot.dayOfWeek], periods: [] });
    }
    byDay.get(slot.dayOfWeek).periods.push({
      id: slot.id,
      period: slot.period,
      subject: slot.subject.name,
      subjectId: slot.subject.id,
      color: slot.subject.color,
      teacher: slot.teacher?.name ?? null,
      teacherId: slot.teacher?.id ?? null,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.room,
    });
  }

  return ok(res, {
    slots,
    days: [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
  });
});

/** POST /api/timetable */
export const createSlot = asyncHandler(async (req, res) => {
  const { instituteId: _ignored, ...data } = req.body;

  const subject = await prisma.subject.findFirst({
    where: { id: data.subjectId, instituteId: req.instituteId },
  });
  if (!subject) throw ApiError.badRequest("Subject does not belong to this institute");

  // A teacher cannot be in two rooms at once.
  if (data.teacherId) {
    const clash = await prisma.timetableSlot.findFirst({
      where: {
        instituteId: req.instituteId,
        teacherId: data.teacherId,
        dayOfWeek: data.dayOfWeek,
        period: data.period,
      },
      include: { subject: { select: { name: true } } },
    });
    if (clash) {
      throw ApiError.conflict(
        `That teacher already has ${clash.subject.name} with ${clash.grade}-${clash.section} in period ${data.period} on ${DAYS[data.dayOfWeek]}`
      );
    }
  }

  const slot = await prisma.timetableSlot.create({
    data: { ...data, instituteId: req.instituteId, teacherId: data.teacherId ?? subject.teacherId },
    include: { subject: true, teacher: { select: { id: true, name: true } } },
  });

  audit(req, { action: "timetable.create", entity: "TimetableSlot", entityId: slot.id });
  return created(res, slot, "Timetable slot added");
});

/** PATCH /api/timetable/:id */
export const updateSlot = asyncHandler(async (req, res) => {
  const existing = await prisma.timetableSlot.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Timetable slot not found");

  const { instituteId: _ignored, ...data } = req.body;

  const slot = await prisma.timetableSlot.update({
    where: { id: existing.id },
    data,
    include: { subject: true, teacher: { select: { id: true, name: true } } },
  });

  return ok(res, slot, "Timetable slot updated");
});

/** DELETE /api/timetable/:id */
export const deleteSlot = asyncHandler(async (req, res) => {
  const existing = await prisma.timetableSlot.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Timetable slot not found");

  await prisma.timetableSlot.delete({ where: { id: existing.id } });
  audit(req, { action: "timetable.delete", entity: "TimetableSlot", entityId: existing.id });
  return ok(res, null, "Timetable slot removed");
});

// ── Class-based scheduling ─────────────────────────────────────────────
// The endpoints above predate AcademicClass and take a loose grade/section
// pair. These take a class id and a real time range, and run the full
// conflict check. Both write the same table, so a slot created either way is
// visible everywhere.

const SLOT_INCLUDE = {
  subject: { select: { id: true, name: true, color: true } },
  teacher: { select: { id: true, name: true } },
  academicClass: { select: { id: true, name: true, section: true, code: true, room: true } },
};

/**
 * Resolves and ownership-checks everything a slot points at.
 *
 * Every id is re-read scoped to the caller's institute, so an admin who posts
 * another school's classId or teacherId gets "does not belong to this
 * institute" rather than a cross-tenant write.
 */
async function resolveRefs({ instituteId, classId, subjectId, teacherId }) {
  const [cls, subject, teacher] = await Promise.all([
    classId ? prisma.academicClass.findFirst({ where: { id: classId, instituteId } }) : null,
    subjectId ? prisma.subject.findFirst({ where: { id: subjectId, instituteId } }) : null,
    teacherId ? prisma.teacher.findFirst({ where: { id: teacherId, instituteId } }) : null,
  ]);

  if (classId && !cls) throw ApiError.badRequest("That class does not belong to this institute");
  if (classId && cls.isArchived) throw ApiError.badRequest(`${cls.name} ${cls.section} is archived — restore it before scheduling`);
  if (subjectId && !subject) throw ApiError.badRequest("That subject does not belong to this institute");
  if (teacherId && !teacher) throw ApiError.badRequest("That teacher does not belong to this institute");

  return { cls, subject, teacher };
}

/** The next free period number for a class on a day. */
async function nextPeriod(instituteId, grade, section, dayOfWeek) {
  const last = await prisma.timetableSlot.findFirst({
    where: { instituteId, grade, section, dayOfWeek },
    orderBy: { period: "desc" },
    select: { period: true },
  });
  return (last?.period ?? 0) + 1;
}

/** POST /api/timetable/schedule */
export const createScheduledSlot = asyncHandler(async (req, res) => {
  const { classId, subjectId, teacherId, dayOfWeek, startTime, endTime, room, academicYear, notes, period } = req.body;

  const { cls, subject } = await resolveRefs({
    instituteId: req.instituteId,
    classId,
    subjectId,
    teacherId,
  });

  // Falls back to the subject's own teacher and the class's room, so a slot
  // entered quickly still carries the information conflict detection needs.
  const effectiveTeacher = teacherId ?? subject.teacherId ?? null;
  const effectiveRoom = room ?? cls.room ?? null;

  const conflicts = await conflictsFor({
    instituteId: req.instituteId,
    dayOfWeek,
    startTime,
    endTime,
    period,
    teacherId: effectiveTeacher,
    room: effectiveRoom,
    grade: cls.name,
    section: cls.section,
  });
  if (conflicts.length) throw ApiError.conflict(conflicts.map((c) => c.message).join(" "), conflicts);

  const slot = await prisma.timetableSlot.create({
    data: {
      instituteId: req.instituteId,
      classId: cls.id,
      grade: cls.name,
      section: cls.section,
      subjectId,
      teacherId: effectiveTeacher,
      dayOfWeek,
      period: period ?? (await nextPeriod(req.instituteId, cls.name, cls.section, dayOfWeek)),
      startTime,
      endTime,
      room: effectiveRoom,
      academicYear: academicYear ?? cls.academicYear,
      notes: notes ?? null,
    },
    include: SLOT_INCLUDE,
  });

  audit(req, { action: "timetable.create", entity: "TimetableSlot", entityId: slot.id, meta: { classId: cls.id } });
  return created(res, slot, "Timetable slot added");
});

/** PATCH /api/timetable/schedule/:id */
export const updateScheduledSlot = asyncHandler(async (req, res) => {
  const existing = await prisma.timetableSlot.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Timetable slot not found");

  const instituteId = existing.instituteId;
  const next = { ...existing, ...req.body };

  const { cls, subject } = await resolveRefs({
    instituteId,
    classId: req.body.classId,
    subjectId: req.body.subjectId,
    teacherId: req.body.teacherId,
  });

  const grade = cls?.name ?? existing.grade;
  const section = cls?.section ?? existing.section;
  const teacherId =
    req.body.teacherId !== undefined ? req.body.teacherId : (subject?.teacherId ?? existing.teacherId);

  /**
   * The edit is checked against every other slot, excluding itself. Create
   * used to be guarded and update was not, so a clean slot could be edited
   * into a clash that the create path would have refused.
   */
  const conflicts = await conflictsFor({
    instituteId,
    dayOfWeek: next.dayOfWeek,
    startTime: next.startTime,
    endTime: next.endTime,
    period: next.period,
    teacherId,
    room: next.room,
    grade,
    section,
    ignoreId: existing.id,
  });
  if (conflicts.length) throw ApiError.conflict(conflicts.map((c) => c.message).join(" "), conflicts);

  const slot = await prisma.timetableSlot.update({
    where: { id: existing.id },
    data: {
      ...req.body,
      ...(cls && { classId: cls.id, grade: cls.name, section: cls.section }),
      ...(teacherId !== existing.teacherId && { teacherId }),
    },
    include: SLOT_INCLUDE,
  });

  audit(req, { action: "timetable.update", entity: "TimetableSlot", entityId: slot.id });
  return ok(res, slot, "Timetable slot updated");
});

/**
 * GET /api/timetable/schedule — the admin grid.
 *
 * Filterable by class, teacher, room and year. Teachers and parents do not
 * reach this route; they keep their own scoped views.
 */
export const getSchedule = asyncHandler(async (req, res) => {
  const { classId, teacherId, room, academicYear, dayOfWeek } = req.query;

  let classFilter = {};
  if (classId) {
    const cls = await prisma.academicClass.findFirst({
      where: { id: classId, ...(req.instituteId && { instituteId: req.instituteId }) },
    });
    if (!cls) throw ApiError.notFound("Class not found");
    // Matched on grade/section rather than classId so slots created before
    // AcademicClass existed still appear under their class.
    classFilter = { grade: cls.name, section: cls.section };
  }

  const slots = await prisma.timetableSlot.findMany({
    where: {
      ...(req.instituteId && { instituteId: req.instituteId }),
      ...classFilter,
      ...(teacherId && { teacherId }),
      ...(room && { room: { equals: room, mode: "insensitive" } }),
      ...(dayOfWeek && { dayOfWeek: Number(dayOfWeek) }),
      // A slot with no year predates year-tagging; include it rather than
      // hide history behind a filter it could never satisfy.
      ...(academicYear && { OR: [{ academicYear }, { academicYear: null }] }),
    },
    include: SLOT_INCLUDE,
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }, { period: "asc" }],
  });

  const rooms = await prisma.timetableSlot.findMany({
    where: { ...(req.instituteId && { instituteId: req.instituteId }), room: { not: null } },
    distinct: ["room"],
    select: { room: true },
    orderBy: { room: "asc" },
  });

  return ok(res, slots, "Schedule fetched", { rooms: rooms.map((r) => r.room) });
});
