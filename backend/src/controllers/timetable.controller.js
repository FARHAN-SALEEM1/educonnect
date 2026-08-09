import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";
import { audit } from "../utils/audit.js";

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * GET /api/timetable?grade=&section=&teacherId=
 * Returns both the flat slot list and a day-grouped view, so the client
 * can render a grid without regrouping.
 */
export const getTimetable = asyncHandler(async (req, res) => {
  const { grade, section, teacherId } = req.query;

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(grade && { grade }),
    ...(section && { section }),
    ...(teacherId && { teacherId }),
    // A teacher with no filter gets their own schedule.
    ...(req.user.role === "TEACHER" && !grade && !teacherId && { teacherId: req.user.teacherId }),
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
  return ok(res, null, "Timetable slot removed");
});
