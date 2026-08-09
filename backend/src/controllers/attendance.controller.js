import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { attendanceSummary } from "../utils/academics.js";
import { studentScopeWhere } from "../utils/access.js";
import { DEFAULT_TIMEZONE, toStoredDate, todayIn } from "../utils/dates.js";

/**
 * Every date in this controller is a calendar date in the *institute's*
 * timezone, stored as UTC midnight. See utils/dates.js for why.
 */
const zoneFor = async (instituteId) => {
  if (!instituteId) return DEFAULT_TIMEZONE;
  const inst = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: { timezone: true },
  });
  return inst?.timezone || DEFAULT_TIMEZONE;
};

/** GET /api/attendance */
export const listAttendance = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, 100);
  const { studentId, grade, section, date, from, to, status } = req.query;

  const studentScope = await studentScopeWhere(req);
  const tz = await zoneFor(req.instituteId);

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(status && { status }),
    ...(date && { date: toStoredDate(date, tz) }),
    ...(!date && (from || to) && {
      date: {
        ...(from && { gte: toStoredDate(from, tz) }),
        ...(to && { lte: toStoredDate(to, tz) }),
      },
    }),
    student: {
      ...studentScope,
      ...(studentId && { id: studentId }),
      ...(grade && { grade }),
      ...(section && { section }),
    },
  };

  const [total, records] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: "desc" }, { student: { name: "asc" } }],
      include: {
        student: { select: { id: true, name: true, rollNo: true, grade: true, section: true } },
        markedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return ok(res, records, "Attendance fetched", pageMeta(total, page, limit));
});

/**
 * GET /api/attendance/register?grade=&section=&date=
 * The marking sheet: every student in the class with today's status
 * pre-filled if it has already been taken.
 */
export const register = asyncHandler(async (req, res) => {
  const { grade, section, date } = req.query;
  if (!grade || !section) throw ApiError.badRequest("grade and section are required");

  const tz = await zoneFor(req.instituteId);
  const day = date ? toStoredDate(date, tz) : todayIn(tz);
  const studentScope = await studentScopeWhere(req);

  const students = await prisma.student.findMany({
    where: { ...studentScope, grade, section, status: "ACTIVE" },
    select: { id: true, name: true, rollNo: true, code: true },
    orderBy: { rollNo: "asc" },
  });

  const existing = await prisma.attendance.findMany({
    where: { studentId: { in: students.map((s) => s.id) }, date: day },
  });
  const byStudent = new Map(existing.map((a) => [a.studentId, a]));

  return ok(res, {
    date: day,
    grade,
    section,
    alreadyMarked: existing.length > 0,
    students: students.map((s) => ({
      ...s,
      status: byStudent.get(s.id)?.status ?? null,
      remarks: byStudent.get(s.id)?.remarks ?? null,
      attendanceId: byStudent.get(s.id)?.id ?? null,
    })),
  });
});

/** POST /api/attendance — mark one student. */
export const markOne = asyncHandler(async (req, res) => {
  const { studentId, date, status, remarks } = req.body;

  const student = await prisma.student.findFirst({
    where: { id: studentId, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { institute: { select: { timezone: true } } },
  });
  if (!student) throw ApiError.notFound("Student not found in this institute");

  const day = toStoredDate(date, student.institute.timezone);

  const record = await prisma.attendance.upsert({
    where: { studentId_date: { studentId, date: day } },
    create: {
      studentId,
      instituteId: student.instituteId,
      date: day,
      status,
      remarks: remarks ?? null,
      markedById: req.user.id,
    },
    update: { status, remarks: remarks ?? null, markedById: req.user.id },
    include: { student: { select: { name: true } } },
  });

  return created(res, record, `${record.student.name} marked ${status.toLowerCase()}`);
});

/**
 * POST /api/attendance/bulk
 * Submit a whole class register at once. Re-submitting the same date
 * overwrites the earlier marks rather than erroring, so a teacher can
 * correct a mistake without deleting rows first.
 */
export const markBulk = asyncHandler(async (req, res) => {
  const { date, records } = req.body;
  const tz = await zoneFor(req.instituteId);
  const day = toStoredDate(date, tz);

  const studentIds = records.map((r) => r.studentId);
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, ...(req.instituteId && { instituteId: req.instituteId }) },
    select: { id: true, instituteId: true },
  });

  const valid = new Map(students.map((s) => [s.id, s.instituteId]));
  const accepted = records.filter((r) => valid.has(r.studentId));
  const rejected = records
    .filter((r) => !valid.has(r.studentId))
    .map((r) => ({ studentId: r.studentId, reason: "not found in this institute" }));

  if (!accepted.length) throw ApiError.badRequest("No valid students in this request", rejected);

  await prisma.$transaction(
    accepted.map((r) =>
      prisma.attendance.upsert({
        where: { studentId_date: { studentId: r.studentId, date: day } },
        create: {
          studentId: r.studentId,
          instituteId: valid.get(r.studentId),
          date: day,
          status: r.status,
          remarks: r.remarks ?? null,
          markedById: req.user.id,
        },
        update: { status: r.status, remarks: r.remarks ?? null, markedById: req.user.id },
      })
    )
  );

  audit(req, {
    action: "attendance.bulk_mark",
    entity: "Attendance",
    meta: { date: day, marked: accepted.length, rejected: rejected.length },
  });

  const counts = accepted.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return created(
    res,
    { date: day, marked: accepted.length, rejected, counts },
    `Attendance saved for ${accepted.length} student(s)`
  );
});

/** PATCH /api/attendance/:id */
export const updateAttendance = asyncHandler(async (req, res) => {
  const existing = await prisma.attendance.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Attendance record not found");

  const record = await prisma.attendance.update({
    where: { id: existing.id },
    data: { status: req.body.status, remarks: req.body.remarks ?? null, markedById: req.user.id },
  });

  return ok(res, record, "Attendance updated");
});

/** DELETE /api/attendance/:id */
export const deleteAttendance = asyncHandler(async (req, res) => {
  const existing = await prisma.attendance.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Attendance record not found");

  await prisma.attendance.delete({ where: { id: existing.id } });
  return ok(res, null, "Attendance record deleted");
});

/**
 * GET /api/attendance/summary?studentId=|grade=&section=&from=&to=
 * Aggregated counts + rate. Without a studentId it summarises the class.
 */
export const summary = asyncHandler(async (req, res) => {
  const { studentId, grade, section, from, to } = req.query;
  const studentScope = await studentScopeWhere(req);
  const tz = await zoneFor(req.instituteId);

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...((from || to) && {
      date: {
        ...(from && { gte: toStoredDate(from, tz) }),
        ...(to && { lte: toStoredDate(to, tz) }),
      },
    }),
    student: {
      ...studentScope,
      ...(studentId && { id: studentId }),
      ...(grade && { grade }),
      ...(section && { section }),
    },
  };

  const records = await prisma.attendance.findMany({
    where,
    select: { status: true, date: true, studentId: true },
    orderBy: { date: "asc" },
  });

  // Daily trend for charting.
  const byDate = new Map();
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(r);
  }

  const trend = [...byDate.entries()].map(([date, rows]) => ({
    date,
    ...attendanceSummary(rows),
  }));

  return ok(res, { ...attendanceSummary(records), trend });
});
