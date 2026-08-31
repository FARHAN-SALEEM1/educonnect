import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { attendanceSummary, summaryFromCounts } from "../utils/academics.js";
import { studentScopeWhere } from "../utils/access.js";
import { DEFAULT_TIMEZONE, toStoredDate, todayIn } from "../utils/dates.js";
import { alertGuardiansOfAbsence, newlyAbsent } from "../services/absence.service.js";
import { count, hasHave } from "../utils/plural.js";

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

/**
 * A register cannot be taken for a day that has not happened yet.
 *
 * Checked here rather than in the schema because it is only decidable in the
 * *institute's* timezone: at 01:00 in Karachi the school's calendar date is
 * already tomorrow in UTC, so a rule comparing against the server clock would
 * refuse a legitimate register. `todayIn` resolves the school's own date,
 * which makes this exact rather than an approximation with slack in it.
 *
 * Why it is worth a guard: typing 2027 for 2026 is one keystroke, and an
 * April–March session changes year mid-year, so it is a keystroke people get
 * wrong. The resulting row is then invisible on the session-scoped result card
 * while still counting towards the attendance summary — two screens giving two
 * different answers for one student, with nothing naming the cause.
 */
const refuseFutureDay = (day, tz) => {
  if (day.getTime() > todayIn(tz).getTime()) {
    throw ApiError.badRequest(
      `Attendance cannot be marked for ${day.toISOString().slice(0, 10)}, which is in the future`
    );
  }
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
      /**
       * Measured at 1,200 students and 72,000 rows: sorting the page by the
       * related student name costs 19 ms against 10 ms for the row's own
       * columns. Nine milliseconds is not a reason to give up reading a day's
       * register in name order.
       */
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
  refuseFutureDay(day, student.institute.timezone);

  // Asked before the write, so correcting a mark that was already ABSENT
  // does not tell the guardian a second time.
  const fresh = await newlyAbsent({ records: [{ studentId, status }], date: day });

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

  const alerts = await alertGuardiansOfAbsence({
    instituteId: student.instituteId,
    studentIds: fresh,
    date: day,
    actorId: req.user.id,
  });

  return created(
    res,
    { ...record, guardiansNotified: alerts.notified },
    `${record.student.name} marked ${status.toLowerCase()}` +
      (alerts.notified ? ". Guardian notified." : "")
  );
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
  refuseFutureDay(day, tz);

  const studentIds = records.map((r) => r.studentId);
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, ...(req.instituteId && { instituteId: req.instituteId }) },
    select: { id: true, instituteId: true },
  });

  const valid = new Map(students.map((s) => [s.id, s.instituteId]));
  /**
   * One row per student, and the last word wins.
   *
   * The register is unique on (student, day), so sending the same child
   * twice writes a single row — but both were counted, so a class of thirty
   * came back as "31 marked", and a child sent PRESENT and then ABSENT was
   * added to each total while only the second was stored. A Map keyed on the
   * student keeps the last entry, which is the one the upsert leaves behind,
   * so what is reported is what was saved.
   */
  const accepted = [
    ...new Map(
      records.filter((r) => valid.has(r.studentId)).map((r) => [r.studentId, r])
    ).values(),
  ];
  const rejected = records
    .filter((r) => !valid.has(r.studentId))
    .map((r) => ({ studentId: r.studentId, reason: "not found in this institute" }));

  if (!accepted.length) throw ApiError.badRequest("No valid students in this request", rejected);

  /**
   * Who is newly absent, decided before the register is written.
   *
   * A teacher saves the register, spots one wrong mark and saves again — the
   * second save must not re-announce every absence of the day. Only students
   * whose stored status actually changes to ABSENT are announced.
   */
  const fresh = await newlyAbsent({ records: accepted, date: day });

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

  /**
   * Notification never fails the register.
   *
   * The register is the record of truth. An alert that could not go out is a
   * smaller problem than a day of attendance that would not save, so this is
   * awaited for an honest count but can never throw past here.
   */
  const alerts = await alertGuardiansOfAbsence({
    instituteId: req.instituteId,
    studentIds: fresh,
    date: day,
    actorId: req.user.id,
  }).catch(() => ({ notified: 0, recipients: [], skipped: [], reason: "alert-failed" }));

  const counts = accepted.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return created(
    res,
    {
      date: day,
      marked: accepted.length,
      rejected,
      counts,
      absencesAnnounced: fresh.length,
      guardiansNotified: alerts.notified,
      guardiansMissing: alerts.skipped,
    },
    `Attendance saved for ${count(accepted.length,"student")}` +
      (alerts.notified
        ? `. ${count(alerts.notified,"guardian")} told about ${count(fresh.length,"absence")}.`
        : alerts.reason === "attendance-alerts-off" && fresh.length
          ? `. ${count(fresh.length,"absence")} not announced — attendance alerts are off.`
          : alerts.skipped?.length
            ? `. ${count(alerts.skipped.length,"absent student")} ${hasHave(alerts.skipped.length)} no guardian linked.`
            : "")
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

  /**
   * Counted in the database, not in Node.
   *
   * This used to read every matching row — `status`, `date`, `studentId` — and
   * tally them here. Correct, and fine while a school had six students. At
   * 1,200 students with a term of registers behind them it was 72,000 rows over
   * the wire on every load, and the endpoint took **10.5 seconds**; the screen
   * that shows it is the one a school opens every morning.
   *
   * Grouping by (date, status) asks Postgres for what the answer actually needs:
   * four rows per school day rather than one per child per day — 240 instead of
   * 72,000 for a term. The daily trend falls out of the same result, so there is
   * no second query and no second definition of the rate.
   */
  const grouped = await prisma.attendance.groupBy({
    by: ["date", "status"],
    where,
    _count: { _all: true },
    orderBy: { date: "asc" },
  });

  const byDate = new Map();
  const overall = {};
  for (const row of grouped) {
    const key = row.date.toISOString().slice(0, 10);
    const n = row._count._all;
    if (!byDate.has(key)) byDate.set(key, {});
    byDate.get(key)[row.status] = (byDate.get(key)[row.status] ?? 0) + n;
    overall[row.status] = (overall[row.status] ?? 0) + n;
  }

  const trend = [...byDate.entries()].map(([date, counts]) => ({
    date,
    ...summaryFromCounts(counts),
  }));

  return ok(res, { ...summaryFromCounts(overall), trend });
});
