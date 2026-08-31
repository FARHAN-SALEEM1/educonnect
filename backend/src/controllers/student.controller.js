import { prisma, prismaRaw } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { nextStudentCode, reserveCodes } from "../utils/codes.js";
import { audit } from "../utils/audit.js";
import { assertBranchInInstitute, findAccessibleStudent, studentScopeWhere } from "../utils/access.js";
import { spellingProblem, spellings } from "../utils/classNames.js";
import { policyFor } from "../services/grading.service.js";
import { PLAN_PUBLIC } from "../utils/publicFields.js";
import {
  assessmentAverage,
  attendanceSummary,
  averageScore,
  classRank,
  marksTotal,
  predictScore,
} from "../utils/academics.js";
import { gradingFor } from "../utils/grading.js";
import { ensureTerms, resolveTerm, weightedAverage, weightingIsComplete } from "../services/term.service.js";
import { generateInsightsForStudent } from "../services/insight.service.js";
import { assertSeatsAvailable, seatsRemaining } from "../utils/subscription.js";
import { balanceOf, isOutstanding } from "../utils/fees.js";
import {
  currentSessionId,
  defaultSpan,
  readSessionId,
  resolveSession,
  sessionFilter,
  sessionPeriodRange,
} from "../services/session.service.js";
import { emailField, phone as phoneRule } from "../validators/common.js";
import { count } from "../utils/plural.js";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Runs a spreadsheet cell through the same phone rule every other route uses,
 * and returns a per-row problem string rather than throwing.
 *
 * The import schema keeps each cell a loose string on purpose so one bad value
 * can't reject the whole file with an opaque `rows.47.phone` path — problems
 * are collected per row and reported back with a line number. That left phone
 * numbers unchecked entirely, so the bulk path could write values that the
 * single-record endpoints would refuse. Delegating to the shared rule keeps
 * one source of truth: change `validators/common.js` and this follows.
 */
const phoneProblem = (value, label) => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null; // blank is fine — phone is optional on both records
  const result = phoneRule.safeParse(raw);
  return result.success ? null : `${label} — ${result.error.issues[0].message}`;
};

/**
 * The same email rule as every other route, returning a per-row problem *and*
 * the normalised address.
 *
 * The import used to carry its own looser regex, so the bulk path accepted
 * addresses the single-record endpoints reject. It also stored the address
 * exactly as typed, while `emailField` lowercases everywhere else — and the
 * guardian lookup below matches on `email`, which Postgres compares
 * case-sensitively. A spreadsheet saying `A@x.com` therefore missed a stored
 * `a@x.com` and created a second parent for the same person, and two sibling
 * rows spelled with different casing created two guardians instead of sharing
 * one. Returning the parsed value is what keeps that dedup honest.
 */
const emailProblem = (value, label) => {
  const blank = { problem: null, value: null };
  if (value == null) return blank;
  const raw = String(value).trim();
  if (!raw) return blank; // a guardian is optional; no email simply means none
  const result = emailField.safeParse(raw);
  return result.success
    ? { problem: null, value: result.data }
    : { problem: `${label} — ${result.error.issues[0].message}`, value: null };
};

/** GET /api/students */
export const listStudents = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, grade, section, status, parentId, branchId, sortBy = "name", order = "asc" } =
    req.query;

  const scope = await studentScopeWhere(req);
  /**
   * The year this list is about.
   *
   * Every figure the list carries — a student's subjects, their average,
   * their position — is a statement about one year. Averaged
   * across two, none of them mean anything.
   */
  const sessionId = await readSessionId(req.instituteId);
  /**
   * The school's own scale, not the platform's.
   *
   * Bands and the pass mark are set per school, but only the result card ever
   * asked — so a school that moved A+ to 80 saw it on the card and nowhere
   * else on this screen.
   */
  const grading = await policyFor(req.instituteId);
  const where = {
    ...scope,
    ...(grade && { grade }),
    ...(section && { section }),
    ...(status && { status }),
    ...(parentId && { parentId }),
    // A campus filter, when the school has campuses at all.
    ...(branchId && { branchId }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { rollNo: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ [sortBy]: order }, { id: "asc" }],
      include: {
        parent: { select: { id: true, name: true, phone: true, email: true, relation: true } },
        enrollments: {
          where: sessionFilter(sessionId),
          select: {
            id: true,
            currentScore: true,
            previousScore: true,
            letterGrade: true,
            subject: {
              select: {
                id: true,
                name: true,
                color: true,
                // The teacher portal matches its own roster by subject teacher;
                // without this the name is null and every such filter misses.
                teacher: { select: { id: true, name: true } },
              },
            },
          },
        },
        institute: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    }),
  ]);

  const studentIds = students.map((s) => s.id);

  // Attendance for the listed students: full history drives the summary,
  // the newest five rows drive the week strip the portals render.
  const attendanceRows = studentIds.length
    ? await prisma.attendance.findMany({
        where: { studentId: { in: studentIds } },
        select: { studentId: true, status: true, date: true },
        orderBy: { date: "desc" },
      })
    : [];

  const byStudent = new Map();
  for (const row of attendanceRows) {
    if (!byStudent.has(row.studentId)) byStudent.set(row.studentId, []);
    byStudent.get(row.studentId).push(row);
  }

  /**
   * Dues, asked of the whole ledger rather than the twelve invoices this list
   * carries for display.
   *
   * `feeInvoices` above is capped at `take: 12` so a row does not drag three
   * years of billing with it — and the dues figure was being summed from that
   * truncated set, so a family with more than twelve invoices was quoted less
   * than it owed, on the screen the office uses to chase payment.
   */
  const dueRows = studentIds.length
    ? await prisma.feeInvoice.findMany({
        where: { studentId: { in: studentIds }, status: { in: ["PENDING", "OVERDUE"] } },
        select: { studentId: true, amount: true, discount: true, lateFee: true, paidAmount: true, status: true },
      })
    : [];

  const duesByStudent = new Map();
  for (const row of dueRows) {
    duesByStudent.set(row.studentId, (duesByStudent.get(row.studentId) ?? 0) + balanceOf(row));
  }

  // Rank is computed across the whole scoped cohort, not just this page —
  // a page-local rank would be meaningless once you turn to page two.
  const cohort = await prisma.student.findMany({
    where: { ...scope, status: "ACTIVE" },
    select: {
      id: true, grade: true, section: true,
      // The same year the list reports, or the ranking would order students
      // by an average taken across different numbers of years.
      enrollments: { where: sessionFilter(sessionId), select: { currentScore: true } },
    },
  });

  const rankByStudent = new Map();
  const classSizeByStudent = new Map();
  const classes = new Map();
  for (const c of cohort) {
    const key = `${c.grade}|${c.section}`;
    if (!classes.has(key)) classes.set(key, []);
    /**
     * `hasScore` decides whether this child gets a position at all.
     *
     * The result card has always refused one to a student with nothing
     * recorded — *a position needs a mark to stand on* — but this list handed
     * every child a number, so a parent read "Ranked #4 of 5" on the Grades
     * tab and found the same field blank on the printed card. The card is the
     * one that was right.
     *
     * The test is deliberately the card's own: `scoreFor` on a year card is
     * `enrollment.currentScore`, so this asks exactly what that asks and
     * nothing new is invented — an enrolment carrying a score but no
     * assessments still counts, here and there alike.
     */
    classes.get(key).push({
      id: c.id,
      average: averageScore(c.enrollments),
      hasScore: c.enrollments.some((e) => e.currentScore !== null),
    });
  }
  for (const members of classes.values()) {
    members.sort((a, b) => b.average - a.average);
    members.forEach((m, i) => {
      // Unmarked children stay in the sort — they carry average 0 and land at
      // the end — so leaving them out of the ranking moves nobody. What they
      // do not get is a number of their own. The class size still counts them:
      // they are in the class, they just have no place in the order yet.
      if (m.hasScore) rankByStudent.set(m.id, i + 1);
      classSizeByStudent.set(m.id, members.length);
    });
  }

  const data = students.map((s) => {
    const records = byStudent.get(s.id) || [];
    // Strongest subject — what the portals plot as the student's headline bar.
    const best = [...s.enrollments]
      .filter((e) => e.currentScore !== null)
      .sort((a, b) => b.currentScore - a.currentScore)[0];

    return {
      id: s.id,
      code: s.code,
      name: s.name,
      grade: s.grade,
      section: s.section,
      rollNo: s.rollNo,
      status: s.status,
      phone: s.phone,
      address: s.address,
      dob: s.dob,
      bloodGroup: s.bloodGroup,
      photoUrl: s.photoUrl,
      parent: s.parent,
      institute: s.institute,
      branch: s.branch,

      average: averageScore(s.enrollments),
      rank: rankByStudent.get(s.id) ?? null,
      classSize: classSizeByStudent.get(s.id) ?? 0,
      topScore: best?.currentScore ?? null,
      topSubject: best?.subject.name ?? null,
      topSubjectColor: best?.subject.color ?? null,
      subjectCount: s.enrollments.length,
      subjects: s.enrollments.map((e) => ({
        enrollmentId: e.id,
        subjectId: e.subject.id,
        name: e.subject.name,
        color: e.subject.color,
        teacher: e.subject.teacher?.name ?? null,
        teacherId: e.subject.teacher?.id ?? null,
        score: e.currentScore,
        previousScore: e.previousScore,
        // The live policy, not the letter cached when this was last marked.
        grade: grading.letterGrade(e.currentScore),
      })),

      attendance: attendanceSummary(records),
      duesOutstanding: duesByStudent.get(s.id) ?? 0,
    };
  });

  return ok(res, data, "Students fetched", pageMeta(total, page, limit));
});

/**
 * GET /api/students/:id
 * The complete student record — this single response backs the whole
 * parent portal (grades, attendance, fees, timetable, insights).
 */
export const getStudent = asyncHandler(async (req, res) => {
  // This year's work. A past year is reached through the result card, which
  // takes `?session=`; this screen is about what the student is doing now.
  const detailSessionId = await readSessionId(req.instituteId);
  /**
   * The school's own scale, not the platform's.
   *
   * Bands and the pass mark are set per school, but only the result card ever
   * asked — so a school that moved A+ to 80 saw it on the card and nowhere
   * else on this screen.
   */
  const grading = await policyFor(req.instituteId);

  const student = await findAccessibleStudent(req, req.params.id, {
    parent: true,
    institute: { select: { id: true, name: true, code: true, logo: true, color: true } },
    enrollments: {
      where: sessionFilter(detailSessionId),
      include: {
        subject: { include: { teacher: { select: { id: true, name: true } } } },
        assessments: { orderBy: { takenOn: "desc" }, take: 10 },
      },
    },
    feeInvoices: {
      orderBy: { period: "desc" },
      // The parent reads the breakdown; without it a challan is one bare number.
      include: { items: { orderBy: { createdAt: "asc" } } },
    },
    aiInsights: {
      include: { subject: { select: { id: true, name: true, color: true } } },
      orderBy: [{ severity: "desc" }, { generatedAt: "desc" }],
    },
  });

  // Attendance: full history for the summary, last 5 school days for the strip.
  const attendance = await prisma.attendance.findMany({
    where: { studentId: student.id },
    orderBy: { date: "desc" },
  });

  const timetable = await prisma.timetableSlot.findMany({
    where: {
      instituteId: student.instituteId,
      grade: student.grade,
      section: student.section,
    },
    include: {
      subject: { select: { id: true, name: true, color: true } },
      teacher: { select: { id: true, name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  // Class rank: compare averages across everyone in the same grade+section.
  const classmates = await prisma.student.findMany({
    where: {
      instituteId: student.instituteId,
      grade: student.grade,
      section: student.section,
      status: "ACTIVE",
    },
    select: {
      id: true,
      enrollments: { where: sessionFilter(detailSessionId), select: { currentScore: true } },
    },
  });

  const { rank, classSize } = classRank(
    classmates.map((c) => ({ studentId: c.id, average: averageScore(c.enrollments) })),
    student.id
  );

  const subjects = student.enrollments.map((e) => ({
    enrollmentId: e.id,
    subjectId: e.subject.id,
    name: e.subject.name,
    color: e.subject.color,
    teacher: e.subject.teacher?.name ?? null,
    teacherId: e.subject.teacher?.id ?? null,
    score: e.currentScore,
    previousScore: e.previousScore,
    grade: grading.letterGrade(e.currentScore),
    predicted: e.predictedScore ?? predictScore(e.currentScore, e.previousScore),
    trend:
      e.currentScore !== null && e.previousScore !== null
        ? Number((e.currentScore - e.previousScore).toFixed(1))
        : 0,
    assessments: e.assessments.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      obtained: a.obtained,
      total: a.total,
      percentage: Number(((a.obtained / a.total) * 100).toFixed(1)),
      takenOn: a.takenOn,
    })),
  }));

  // Flattened, newest-first assessment feed across every subject.
  const recentAssessments = subjects
    .flatMap((s) => s.assessments.map((a) => ({ ...a, subject: s.name, color: s.color })))
    .sort((a, b) => new Date(b.takenOn) - new Date(a.takenOn))
    .slice(0, 10);

  // Last 5 records, oldest-first, for the week strip.
  const weekAttendance = attendance
    .slice(0, 5)
    .reverse()
    .map((a) => ({ date: a.date, day: DAY_LABELS[new Date(a.date).getDay()], status: a.status }));

  // Present days per month for the last 12 months.
  const monthly = Array.from({ length: 12 }, (c, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const inMonth = attendance.filter((a) => {
      const ad = new Date(a.date);
      return `${ad.getFullYear()}-${String(ad.getMonth() + 1).padStart(2, "0")}` === key;
    });
    return {
      month: key,
      present: inMonth.filter((a) => a.status === "PRESENT" || a.status === "LATE").length,
      total: inMonth.length,
    };
  });

  // Received is received, whatever the status; outstanding is what is left of
  // the challans that still owe. A part-paid challan contributes to both.
  const feeSummary = student.feeInvoices.reduce(
    (acc, f) => {
      acc.paid += f.paidAmount ?? 0;
      if (isOutstanding(f)) acc.outstanding += balanceOf(f);
      return acc;
    },
    { paid: 0, outstanding: 0 }
  );

  return ok(res, {
    id: student.id,
    code: student.code,
    name: student.name,
    grade: student.grade,
    section: student.section,
    rollNo: student.rollNo,
    dob: student.dob,
    gender: student.gender,
    bloodGroup: student.bloodGroup,
    phone: student.phone,
    address: student.address,
    photoUrl: student.photoUrl,
    status: student.status,
    admittedAt: student.admittedAt,
    institute: student.institute,
    parent: student.parent,

    average: averageScore(student.enrollments),
    // No marks, no position — the same rule the result card applies, so the
    // two screens stop disagreeing about the same child. See the list above.
    rank: student.enrollments.some((e) => e.currentScore !== null) ? rank : null,
    classSize,

    subjects,
    recentAssessments,
    attendance: {
      ...attendanceSummary(attendance),
      week: weekAttendance,
      monthly,
    },
    fees: {
      ...feeSummary,
      invoices: student.feeInvoices,
    },
    timetable,
    aiInsights: student.aiInsights,
  });
});

/** POST /api/students */
export const createStudent = asyncHandler(async (req, res) => {
  const { subjectIds, instituteId: _ignored, ...data } = req.body;
  const instituteId = req.instituteId;

  // Enforce the plan's seat limit before adding anyone.
  //
  // `_count` is a nested read, which the soft-delete extension does not touch,
  // so the filter has to be explicit. Without it a removed student kept
  // occupying its seat forever: /institutes/me/subscription (which does filter)
  // reported a seat free while this refused to use it.
  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    include: { plan: { select: PLAN_PUBLIC }, _count: { select: { students: { where: { deletedAt: null } } } } },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  // Enforced against the institute's effective cap, not the plan's raw
  // maximum — a school may sit below its plan's ceiling on purpose.
  assertSeatsAvailable(institute, institute._count.students, 1);

  /**
   * A roll number the recycle bin is holding.
   *
   * Without this the insert fails on the unique constraint, and the admin is
   * told the number is taken by a child who appears in no listing — the one
   * place they have no reason to look is the only place it is.
   */
  if (data.rollNo) {
    const held = await prismaRaw.student.findFirst({
      where: { instituteId, rollNo: data.rollNo, deletedAt: { not: null } },
      select: { name: true },
    });
    if (held) {
      throw ApiError.conflict(
        `Roll number ${data.rollNo} belongs to ${held.name}, a removed student ` +
          `in the recycle bin. Restore them, or give this child a different number.`
      );
    }
  }

  if (data.parentId) {
    const parent = await prisma.parent.findFirst({
      where: { id: data.parentId, instituteId },
    });
    if (!parent) throw ApiError.badRequest("Selected parent does not belong to this institute");
  }

  await assertBranchInInstitute(data.branchId, instituteId);

  const code = await nextStudentCode(instituteId);
  const academicSessionId = subjectIds?.length ? await currentSessionId(instituteId) : null;

  const student = await prisma.student.create({
    data: {
      ...data,
      code,
      instituteId,
      dob: data.dob ? new Date(data.dob) : null,
      /**
       * Admitting a child straight into their subjects.
       *
       * An enrolment belongs to an academic year, and this nested create never
       * said which — so every admission that named a subject failed on the
       * database, and the admin was told "Invalid data sent to the database"
       * about a field the API documents and accepts. `POST /subjects/enroll`
       * had it right all along; this is the same line.
       */
      ...(subjectIds?.length && {
        enrollments: {
          create: subjectIds.map((subjectId) => ({ subjectId, academicSessionId })),
        },
      }),
    },
    include: { parent: true, enrollments: { include: { subject: true } } },
  });

  audit(req, { action: "student.create", entity: "Student", entityId: student.id });
  return created(res, student, `${student.name} admitted successfully`);
});

/**
 * POST /api/students/import
 *
 * Bulk onboarding from a spreadsheet — how schools actually arrive with their
 * data. The client parses the CSV and posts rows; this validates every row
 * first and only writes if the whole batch is clean (unless `partial` is set),
 * so an admin never ends up with half a year group imported.
 *
 * A guardian email creates or reuses a parent record and links the sibling
 * to the same guardian, which is the common case for real rosters.
 */
export const importStudents = asyncHandler(async (req, res) => {
  const { rows, partial = false, createParents = true } = req.body;
  const instituteId = req.instituteId;

  // One campus for the batch, checked once rather than two thousand times.
  await assertBranchInInstitute(req.body.branchId, instituteId);

  // Same explicit soft-delete filter as the single-student path — a bulk
  // import must not be blocked by seats that removed students still hold.
  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    include: { plan: { select: PLAN_PUBLIC }, _count: { select: { students: { where: { deletedAt: null } } } } },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  assertSeatsAvailable(institute, institute._count.students, rows.length);
  const seats = seatsRemaining(institute, institute._count.students);

  // Existing roll numbers, so duplicates are reported rather than thrown by
  // the database one row at a time.
  const existing = await prisma.student.findMany({
    where: { instituteId },
    select: { rollNo: true, grade: true, section: true },
  });
  const takenRolls = new Set(existing.map((s) => s.rollNo));

  /**
   * Roll numbers held by children in the recycle bin.
   *
   * `rollNo` is unique per institute on the table, and a soft delete leaves
   * the row — so a removed child keeps their number. The lookup above uses
   * the extended client, which hides them, and the roll therefore looked
   * free: the row passed validation, the insert hit the constraint, and the
   * whole file failed on a message that named no row and nowhere to look.
   */
  const removedRolls = new Map(
    (
      await prismaRaw.student.findMany({
        where: { instituteId, deletedAt: { not: null } },
        select: { rollNo: true, name: true },
      })
    ).map((s) => [s.rollNo, s.name])
  );

  /**
   * The class spellings this school already uses.
   *
   * Built from the rows already fetched for the roll-number check, so this
   * costs no extra query. The rule itself lives in utils/classNames.js — the
   * student form applies the same one.
   */
  const gradeSpellings = spellings(existing.map((s) => s.grade));
  const sectionSpellings = spellings(existing.map((s) => s.section));

  const valid = [];
  const errors = [];
  const seenRolls = new Set();

  rows.forEach((row, index) => {
    const line = index + 2; // +1 for zero-index, +1 for the header row
    const problems = [];

    if (!row.name?.trim()) problems.push("name is required");
    if (!row.grade?.trim()) problems.push("grade is required");
    if (!row.rollNo?.trim()) problems.push("rollNo is required");

    const roll = row.rollNo?.trim();
    if (roll && takenRolls.has(roll)) problems.push(`roll number "${roll}" already exists`);
    else if (roll && removedRolls.has(roll)) {
      problems.push(
        `roll number "${roll}" belongs to ${removedRolls.get(roll)}, a removed ` +
          `student in the recycle bin — restore them, or give this child a ` +
          `different number`
      );
    }
    if (roll && seenRolls.has(roll)) problems.push(`roll number "${roll}" is duplicated in this file`);

    for (const [label, value, known] of [
      ["grade", row.grade?.trim(), gradeSpellings],
      ["section", row.section?.trim(), sectionSpellings],
    ]) {
      const problem = spellingProblem(label, value, known);
      if (problem) problems.push(problem);
    }

    if (row.dob && Number.isNaN(new Date(row.dob).getTime())) {
      problems.push("dob is not a valid date (use YYYY-MM-DD)");
    }

    // Email and both phone columns go through the same rules as every other route.
    const guardianEmail = emailProblem(row.guardianEmail, "guardianEmail");
    if (guardianEmail.problem) problems.push(guardianEmail.problem);
    const phoneIssue = phoneProblem(row.phone, "phone");
    if (phoneIssue) problems.push(phoneIssue);
    const guardianPhoneIssue = phoneProblem(row.guardianPhone, "guardianPhone");
    if (guardianPhoneIssue) problems.push(guardianPhoneIssue);

    if (problems.length) {
      errors.push({ line, name: row.name ?? "(blank)", problems });
      return;
    }

    seenRolls.add(roll);
    // Carry the normalised address forward so the guardian lookup and the
    // record it writes agree with each other and with the rest of the API.
    valid.push({ ...row, rollNo: roll, guardianEmail: guardianEmail.value, line });
  });

  if (errors.length && !partial) {
    throw ApiError.unprocessable(
      `${errors.length} of ${count(rows.length,"row")} have problems — nothing was imported. Fix them, or re-send with partial=true to import the ${count(valid.length,"valid row")}.`,
      errors
    );
  }

  if (!valid.length) throw ApiError.badRequest("No valid rows to import", errors);

  // Codes come from the highest ever issued, not from a live row count.
  // Counting live rows collides with the codes that soft-deleted rows still
  // hold in the unique (instituteId, code) index — the whole import then fails
  // with a 409 that names no row.
  const studentCodes = await reserveCodes("student", "STU", { instituteId }, valid.length);
  const guardianEmails = [...new Set(valid.map((r) => r.guardianEmail).filter(Boolean))];
  const parentCodes = await reserveCodes("parent", "PAR", { instituteId }, guardianEmails.length);

  const result = await prisma.$transaction(async (tx) => {
    // Reuse a guardian across siblings instead of creating duplicates.
    const parentByEmail = new Map();
    if (createParents) {
      // Already trimmed and lowercased by emailProblem, so this matches what
      // the other routes stored rather than whatever casing the file used.
      const emails = [...new Set(valid.map((r) => r.guardianEmail).filter(Boolean))];
      if (emails.length) {
        const found = await tx.parent.findMany({
          where: { instituteId, email: { in: emails } },
        });
        for (const p of found) parentByEmail.set(p.email, p);
      }
    }

    // Index into the pre-reserved parent codes, advanced only when a new
    // guardian is actually created (siblings share one).
    let nextParentCode = 0;
    // Not named `created` — that's the response helper imported above.
    const madeStudents = [];

    for (const [i, row] of valid.entries()) {
      let parentId = null;

      if (createParents && row.guardianEmail) {
        const email = row.guardianEmail; // normalised above
        let parent = parentByEmail.get(email);

        if (!parent) {
          parent = await tx.parent.create({
            data: {
              code: parentCodes[nextParentCode++],
              name: row.guardianName?.trim() || `Guardian of ${row.name.trim()}`,
              email,
              phone: row.guardianPhone?.trim() || null,
              relation: row.guardianRelation?.trim() || "Guardian",
              instituteId,
            },
          });
          parentByEmail.set(email, parent);
        }
        parentId = parent.id;
      }

      const student = await tx.student.create({
        data: {
          code: studentCodes[i],
          name: row.name.trim(),
          grade: row.grade.trim(),
          section: row.section?.trim() || "A",
          rollNo: row.rollNo,
          dob: row.dob ? new Date(row.dob) : null,
          gender: row.gender?.trim() || null,
          bloodGroup: row.bloodGroup?.trim() || null,
          phone: row.phone?.trim() || null,
          address: row.address?.trim() || null,
          instituteId,
          parentId,
          ...(req.body.branchId && { branchId: req.body.branchId }),
        },
      });

      madeStudents.push({
        id: student.id,
        code: student.code,
        name: student.name,
        rollNo: student.rollNo,
      });
    }

    return { madeStudents, parentsCreated: parentByEmail.size };
  });

  audit(req, {
    action: "student.import",
    entity: "Student",
    meta: { imported: result.madeStudents.length, skipped: errors.length },
  });

  return created(
    res,
    {
      imported: result.madeStudents.length,
      parentsCreated: result.parentsCreated,
      skipped: errors.length,
      seatsRemaining: seats - result.madeStudents.length,
      students: result.madeStudents,
      errors,
    },
    `Imported ${count(result.madeStudents.length,"student")}${errors.length ? `, skipped ${errors.length}` : ""}.`
  );
});

/** PATCH /api/students/:id */
export const updateStudent = asyncHandler(async (req, res) => {
  const current = await findAccessibleStudent(req, req.params.id);

  const { subjectIds, instituteId: _ignored, ...data } = req.body;
  if (data.dob) data.dob = new Date(data.dob);

  /**
   * A guardian this school actually has.
   *
   * `createStudent` has always checked this; the update path spread whatever
   * arrived straight into the row, so a school could hand its own student to
   * another school's parent — who would then have the child on their portal.
   * Siblings make this path ordinary rather than exotic: linking a second child
   * to an existing guardian is an update, not a create.
   */
  if (data.parentId) {
    const parent = await prisma.parent.findFirst({
      where: { id: data.parentId, instituteId: current.instituteId },
      select: { id: true },
    });
    if (!parent) throw ApiError.badRequest("Selected parent does not belong to this institute");
  }

  await assertBranchInInstitute(data.branchId, current.instituteId);

  const student = await prisma.student.update({
    where: { id: req.params.id },
    data,
    include: { parent: true },
  });

  audit(req, { action: "student.update", entity: "Student", entityId: student.id });
  return ok(res, student, "Student updated");
});

/**
 * DELETE /api/students/:id
 * Soft delete — marks, attendance and fee history survive, so a student
 * removed by mistake (or one who returns next term) can be restored.
 */
export const deleteStudent = asyncHandler(async (req, res) => {
  const student = await findAccessibleStudent(req, req.params.id);

  await prisma.student.update({
    where: { id: student.id },
    data: { deletedAt: new Date() },
  });

  audit(req, {
    action: "student.delete",
    entity: "Student",
    entityId: student.id,
    meta: { name: student.name, soft: true },
  });

  return ok(res, null, `${student.name} removed. Restorable from the recycle bin.`);
});

/** GET /api/students/deleted */
export const listDeletedStudents = asyncHandler(async (req, res) => {
  const students = await prismaRaw.student.findMany({
    where: { instituteId: req.instituteId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true, code: true, name: true, grade: true, section: true,
      rollNo: true, deletedAt: true,
    },
  });
  return ok(res, students);
});

/** POST /api/students/:id/restore */
export const restoreStudent = asyncHandler(async (req, res) => {
  const student = await prismaRaw.student.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId },
  });

  if (!student) throw ApiError.notFound("Student not found");
  if (!student.deletedAt) throw ApiError.badRequest("That student is not deleted");

  // The roll number may have been handed to someone else in the meantime.
  const clash = await prisma.student.findFirst({
    where: { instituteId: student.instituteId, rollNo: student.rollNo },
  });
  if (clash) {
    throw ApiError.conflict(
      `Roll number ${student.rollNo} now belongs to ${clash.name}. Change theirs before restoring ${student.name}.`
    );
  }

  await prismaRaw.student.update({ where: { id: student.id }, data: { deletedAt: null } });

  audit(req, { action: "student.restore", entity: "Student", entityId: student.id });
  return ok(res, null, `${student.name} restored.`);
});

/** POST /api/students/:id/insights — regenerate the AI recommendations. */
export const refreshInsights = asyncHandler(async (req, res) => {
  const student = await findAccessibleStudent(req, req.params.id);
  const insights = await generateInsightsForStudent(student.id);
  return ok(res, insights, `Generated ${insights.length} insights for ${student.name}`);
});

/** GET /api/students/:id/report — full academic report for printing/export. */
export const studentReport = asyncHandler(async (req, res) => {
  /**
   * One academic year, not all of them.
   *
   * A card used to carry every enrolment, every attendance row and every
   * invoice a student had ever had. That was invisible while a school had only
   * lived one year — and would have become a serious lie the moment one was
   * promoted, because last year's Grade 8 marks would have printed on this
   * year's Grade 9 card as though they were current.
   *
   * `?session=2026-27` reaches a past year; nothing named means the year the
   * school is running. Marks come through the enrolment's own session;
   * attendance and fees come through the dates that session covers, which is
   * what `AcademicSession` exists to provide.
   */
  const bare = await findAccessibleStudent(req, req.params.id, {
    institute: { select: { id: true } },
  });
  const session = await resolveSession(bare.instituteId, req.query.session);

  /**
   * The school's own grading policy — its bands and its pass mark.
   *
   * Not the platform's. A+ at 90 and a pass at 33 are common but neither is
   * universal, and a card graded on somebody else's scale is a card the school
   * cannot stand behind.
   */
  const policyHolder = await prisma.institute.findUnique({
    where: { id: bare.instituteId },
    select: { gradingSettings: true },
  });
  const grading = gradingFor(policyHolder);

  /**
   * The years this student actually has a card for.
   *
   * Their own, not the school's: offering a year the child was not enrolled in
   * would hand the reader an empty card and no way to tell whether that means
   * "no marks yet" or "was not here".
   */
  const theirYears = await prisma.academicSession.findMany({
    where: { instituteId: bare.instituteId, enrollments: { some: { studentId: bare.id } } },
    select: { id: true, name: true, isCurrent: true },
    orderBy: { startsOn: "desc" },
  });
  // A school with no session recorded reads every year, exactly as it did
  // before sessions existed.
  const periods = session ? sessionPeriodRange(session) : null;
  const scoped = sessionFilter(session?.id);

  const student = await findAccessibleStudent(req, req.params.id, {
    institute: { select: { name: true, city: true, logo: true } },
    parent: { select: { name: true, phone: true, email: true, relation: true } },
    enrollments: {
      where: scoped,
      include: {
        subject: { include: { teacher: { select: { name: true } } } },
        assessments: { orderBy: { takenOn: "asc" } },
      },
    },
    feeInvoices: {
      ...(periods && { where: { period: { gte: periods.from, lte: periods.to } } }),
      orderBy: { period: "asc" },
    },
  });

  const attendance = await prisma.attendance.findMany({
    where: {
      studentId: student.id,
      ...(session && { date: { gte: session.startsOn, lte: session.endsOn } }),
    },
    orderBy: { date: "asc" },
  });

  /**
   * One term, or the whole year.
   *
   * A Pakistani result card reports a term: it carries that term's marks and
   * nothing else. Asked for a term, every figure below — each subject's score,
   * the average, the overall grade and the position — comes from that
   * term's assessments alone. Asked for nothing, the card behaves exactly as it
   * did before terms existed and reports the rolled-up `currentScore`, so no
   * existing caller changes behaviour.
   *
   * Marks recorded before terms were introduced carry no term, so they belong
   * to no term's card. Assigning them one would be inventing history.
   */
  /**
   * The term this card covers, named by the school rather than chosen from a
   * fixed list of three. Resolved inside the card's own session, so
   * `?term=Mid Term` means this year's Mid Term and last year's cannot be
   * confused with it.
   */
  const terms = await ensureTerms(session.id);
  const examTerm = await resolveTerm(session.id, req.query.term);
  const term = examTerm?.id ?? null;

  /**
   * Whether this card combines the year's terms the way the school weights
   * them.
   *
   * Only ever on the whole-year card. A card asked for one term reports that
   * term and nothing else — weighting it against terms it does not cover
   * would answer a question nobody asked.
   *
   * And only when the weighting is complete: every term carrying a share and
   * the shares adding up to 100. A half-configured policy pools the marks, as
   * it did before any of this existed.
   */
  const weighted = !term && weightingIsComplete(terms);

  /**
   * What one enrolment reports on this card: a single term's average, the
   * year weighted the school's way, or the rolled-up year.
   */
  const scoreFor = (enrollment) =>
    term
      ? assessmentAverage(enrollment.assessments.filter((a) => a.examTermId === term))
      : weighted
        ? weightedAverage(enrollment.assessments, terms).score
        : enrollment.currentScore;

  /** The enrolments shaped the way averageScore reads them. */
  const termScores = student.enrollments.map((e) => ({ currentScore: scoreFor(e) }));

  /**
   * Has anything been marked in this term at all?
   *
   * `averageScore` answers 0 for an empty set and `letterGrade(0)` is F, so a
   * term card printed before the exams would have handed every parent a 0% and
   * an F — and a position, ranked among a class where everyone scored the same
   * nothing. An unmarked term reports nothing instead, and the card says so.
   */
  /**
   * Extended to the whole-year card once a school could have more than one year.
   *
   * The reasoning above was written for terms, but a freshly promoted class is
   * the same situation writ large: nobody has been marked yet, so every average
   * is 0, every grade is F, and `classRank` hands out positions by sorting a
   * class where everyone scored the same nothing. `scoreFor` already answers
   * "what does this enrolment report on this card" for both cases, so one
   * question covers both: is there a single mark to stand on?
   */
  const termHasMarks = student.enrollments.some((e) => scoreFor(e) !== null);

  /**
   * Position in class — the first thing a Pakistani parent looks for.
   *
   * The class has to be the one the student was in **that year**, not the one
   * they are in today. Ranking a 2026-27 card against today's Grade 9 register
   * compares a child against people who were not in the room: after a
   * promotion their Grade 8 classmates have all moved on, and the card would
   * report first of one.
   *
   * `StudentPromotion` already records where every student was when they
   * moved — `fromGrade`/`fromSection` for a given `fromSession` — so the old
   * register can be rebuilt from it. A student with no promotion row for that
   * year never moved out of it, so their current class is still the right
   * answer.
   */
  const movesThatYear = session
    ? await prisma.studentPromotion.findMany({
        where: { instituteId: student.instituteId, fromSession: session.name },
        select: { studentId: true, fromGrade: true, fromSection: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  /**
   * The *first* move recorded out of that year wins.
   *
   * A school can promote the same class more than once — a correction, a
   * re-run, a class moved in two halves — and each attempt writes its own
   * history row. Later rows say where the student was by then, not where they
   * were when the year began, so taking the last one would answer the question
   * with the wrong register.
   */
  const wasIn = new Map();
  for (const m of movesThatYear) {
    if (!wasIn.has(m.studentId)) wasIn.set(m.studentId, `${m.fromGrade}|${m.fromSection}`);
  }

  // The card's own subject: which class this student was in that year.
  const cardClass = wasIn.get(student.id) ?? `${student.grade}|${student.section}`;
  const [cardGrade, cardSection] = cardClass.split("|");

  const roll = await prisma.student.findMany({
    where: {
      instituteId: student.instituteId,
      // Graduated students still belong on the register of the year they sat.
      status: session?.isCurrent === false ? undefined : "ACTIVE",
    },
    select: {
      id: true,
      grade: true,
      section: true,
      enrollments: {
        // The same year the card reports. A position worked out across two
        // years at once would be a number about nothing.
        where: scoped,
        select: {
          currentScore: true,
          /**
           * The marks the card's own figure is built from, so a position is
           * worked out on the same basis as the score above it. A term card
           * needs that term's marks; a weighted year needs every mark with the
           * term it belongs to.
           */
          ...((term || weighted) && {
            assessments: {
              ...(term && { where: { examTermId: term } }),
              select: { obtained: true, total: true, ...(!term && { examTermId: true }) },
            },
          }),
        },
      },
    },
  });

  const classmates = roll.filter(
    (c) => (wasIn.get(c.id) ?? `${c.grade}|${c.section}`) === cardClass
  );

  // Ranked on whatever the card reports, so a term card shows the term's
  // position rather than the year's.
  const { rank, classSize } = classRank(
    classmates.map((c) => ({
      studentId: c.id,
      average: averageScore(
        term
          ? c.enrollments.map((e) => ({ currentScore: assessmentAverage(e.assessments) }))
          : weighted
            ? c.enrollments.map((e) => ({
                currentScore: weightedAverage(e.assessments, terms).score,
              }))
            : c.enrollments
      ),
    })),
    student.id
  );

  return ok(res, {
    generatedAt: new Date(),
    institute: student.institute,
    // Every year this student has a card for, so a reader can move between
    // them without guessing which exist.
    sessions: theirYears,
    // Which year this card covers. Null for a school with none recorded,
    // which is honest rather than inventing one.
    session: session && {
      id: session.id,
      name: session.name,
      startsOn: session.startsOn,
      endsOn: session.endsOn,
      isCurrent: session.isCurrent,
    },
    student: {
      code: student.code,
      name: student.name,
      // The class they were in that year. A past card headed with today's
      // class would say a Grade 9 student sat the Grade 8 exam this year.
      grade: cardGrade,
      section: cardSection,
      currentGrade: student.grade,
      currentSection: student.section,
      rollNo: student.rollNo,
      dob: student.dob,
      bloodGroup: student.bloodGroup,
    },
    parent: student.parent,
    // Which term this card covers; null means the whole year.
    term: examTerm?.name ?? null,
    // The year's terms, so a reader can move between them and an annual card
    // can lay them out side by side.
    terms: terms.map((t) => ({
      id: t.id, name: t.name, sequence: t.sequence, weightage: t.weightage,
    })),
    // True only when every term carries a share and they add up to 100.
    termsAreWeighted: weightingIsComplete(terms),

    /**
     * What the weighting actually did to this card, or null when it did
     * nothing.
     *
     * A reader has to be able to check the arithmetic: which terms counted,
     * what share each carried, and whether the shares had to be scaled back up
     * because a term has not been sat yet. Printing a combined figure with no
     * way to see how it was reached is how a school ends up unable to answer a
     * parent at the counter.
     */
    weighting: weighted
      ? (() => {
          const seen = new Set(
            student.enrollments.flatMap((e) =>
              e.assessments.map((a) => a.examTermId).filter(Boolean)
            )
          );
          const counted = terms.filter((t) => seen.has(t.id));
          const share = counted.reduce((sum, t) => sum + t.weightage, 0);
          return {
            terms: terms.map((t) => ({
              name: t.name,
              weightage: t.weightage,
              // False for a term the school has not marked yet.
              counted: seen.has(t.id),
            })),
            // Below 100 means some term has no marks and the rest were scaled
            // up to cover it, rather than it counting as a zero.
            shareCounted: share,
            scaledUp: share > 0 && share < 100,
            // Marks belonging to no term carry no weight, so they are not in
            // the figure above. Saying how many is better than dropping them
            // quietly.
            marksOutsideTerms: student.enrollments.reduce(
              (sum, e) => sum + e.assessments.filter((a) => !a.examTermId).length,
              0
            ),
          };
        })()
      : null,
    average: termHasMarks ? averageScore(termScores) : null,

    /**
     * The grand total — "850 / 1100" at the foot of the card.
     *
     * Summed from the marks themselves rather than from the per-subject
     * percentages, so a subject marked out of 50 counts for half of one marked
     * out of 100, which is what a school means by a total.
     */
    marks: (() => {
      const rows = student.enrollments.flatMap((e) =>
        term ? e.assessments.filter((a) => a.examTermId === term) : e.assessments
      );
      if (!rows.length) return null;
      const t = marksTotal(rows);
      return t.total ? { ...t, percentage: Number(((t.obtained / t.total) * 100).toFixed(1)) } : null;
    })(),

    /**
     * The result: what the card is actually for.
     *
     * A Pakistani card ends in a judgement — passed or failed, and whether the
     * child moves up. Until now the card reported figures and left the reader to
     * work it out, which is the one thing a result card must not do.
     *
     * A subject with no marks is not a failure, so it is left out of the count
     * rather than counted against the student.
     */
    result: termHasMarks
      ? (() => {
          const judged = student.enrollments
            .map((e) => grading.passed(scoreFor(e)))
            .filter((p) => p !== null);
          const failed = judged.filter((p) => p === false).length;
          const overall = averageScore(termScores);
          return {
            passingPercentage: grading.passingPercentage,
            subjectsPassed: judged.length - failed,
            subjectsFailed: failed,
            subjectsJudged: judged.length,
            // Passing means clearing every subject *and* the overall mark —
            // the rule every board in the country applies.
            passed: judged.length > 0 && failed === 0 && overall >= grading.passingPercentage,
          };
        })()
      : null,
    // The overall letter comes from the same bands as every subject letter on
    // the card. Working it out again in the browser meant two grading scales on
    // one document: a subject at 84.8 read A while the overall read A+.
    overallGrade: termHasMarks ? grading.letterGrade(averageScore(termScores)) : null,
    // No marks means no position: ranking a class where nobody has been
    // marked would order them by nothing at all.
    rank: termHasMarks ? rank : null,
    classSize,
    subjects: student.enrollments.map((e) => ({
      name: e.subject.name,
      teacher: e.subject.teacher?.name ?? null,
      score: scoreFor(e),
      /**
       * The marks themselves, which is how a Pakistani card is written.
       *
       * `82 / 100` is what a parent checks; the percentage is a summary of it.
       * Null totals on the full-year card when the score came from somewhere
       * other than marks — there is no "out of" for a number typed by hand.
       */
      marks: (() => {
        const rows = term ? e.assessments.filter((a) => a.examTermId === term) : e.assessments;
        if (!rows.length) return null;
        const t = marksTotal(rows);
        return t.total ? t : null;
      })(),
      /**
       * Each term of the year, so an annual card can lay them out side by side
       * — "First 78 · Mid 82 · Final 85" — which is how a Pakistani annual card
       * is written. Null on a term card, where there is only the one column.
       */
      terms: term
        ? null
        : terms.map((t) => {
            const rows = e.assessments.filter((a) => a.examTermId === t.id);
            const totals = rows.length ? marksTotal(rows) : null;
            return {
              name: t.name,
              sequence: t.sequence,
              weightage: t.weightage,
              score: assessmentAverage(rows),
              marks: totals?.total ? totals : null,
            };
          }),
      passed: grading.passed(scoreFor(e)),
      // What this subject's marks actually average to.
      //
      // On a term card this equals `score` by construction. On the full-year
      // card `score` is the stored `currentScore`, which a teacher can also
      // set by hand through Quick Grade Entry — so the two can disagree, and
      // until now nothing showed that they had. Carrying both lets a screen
      // say "recorded 23, marks say 85" instead of quietly picking one.
      marksAverage: assessmentAverage(
        term ? e.assessments.filter((a) => a.examTermId === term) : e.assessments
      ),
      previousScore: e.previousScore,
      // Computed from the school's bands rather than read from the stored
      // letter, which was written under whatever scale was in force then.
      grade: grading.letterGrade(scoreFor(e)),
      // How many marks stand behind that figure, so a reader can tell an empty
      // term from a genuine zero.
      assessmentCount: term
        ? e.assessments.filter((a) => a.examTermId === term).length
        : e.assessments.length,
      assessments: e.assessments,
    })),
    attendance: attendanceSummary(attendance),
    fees: student.feeInvoices,
  });
});

/**
 * POST /api/students/promote — the end-of-session move.
 *
 * A Pakistani school runs this once a year, in March or April: a class is
 * promoted to the next one, a few students are retained to repeat the year, and
 * the top class graduates out. Until now the product had no way to do it, which
 * meant it worked for exactly one session and then needed a developer.
 *
 * `Student.grade` + `Student.section` is what the whole product treats as class
 * membership — attendance registers, gradebooks, timetables and rosters all key
 * off that pair — so promotion changes it in place. That is why every move is
 * also written to `student_promotions`: without it the class a student came
 * from would simply be gone, and nobody could answer "which section was she in
 * last year?" or undo a mistake.
 *
 * `dryRun` is not decoration. This moves a whole class at once, and an admin
 * should be able to see exactly who would go where before committing.
 *
 * What this deliberately does NOT do:
 *
 *  - it does not touch marks, attendance or fees. Those stay attached to the
 *    student and remain readable, which is the point of keeping history.
 *  - it does not enrol anyone in their new subjects. Subjects are per grade, so
 *    the new class's enrolments are a separate, deliberate act — silently
 *    creating them would guess at a curriculum nobody asked for.
 *  - RETAINED students keep their existing enrolments, marks and all, because
 *    `Enrollment` is unique per (student, subject) and a repeat year reuses the
 *    same subject rows. A school repeating a student mid-product will see last
 *    year's marks until they are cleared by hand. Fixing that properly needs a
 *    session on Enrollment, which is a larger change than this one.
 */
export const promoteStudents = asyncHandler(async (req, res) => {
  const {
    fromGrade,
    fromSection,
    toGrade,
    toSection,
    toSession,
    outcome = "PROMOTED",
    studentIds,
    notes,
    dryRun = false,
  } = req.body;

  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { id: true, currentSession: true },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  const fromSession = institute.currentSession;
  if (toSession === fromSession) {
    throw ApiError.badRequest(
      `The school is already in ${fromSession}. Promote into the session that follows it.`
    );
  }

  if (outcome !== "GRADUATED" && (!toGrade || !toSection)) {
    throw ApiError.badRequest("A promotion needs the class to move into");
  }

  // Only ever the caller's own institute, and never a removed student.
  const students = await prisma.student.findMany({
    where: {
      instituteId: institute.id,
      grade: fromGrade,
      section: fromSection,
      status: "ACTIVE",
      ...(studentIds?.length && { id: { in: studentIds } }),
    },
    select: { id: true, name: true, rollNo: true, grade: true, section: true },
    orderBy: { name: "asc" },
  });

  if (!students.length) {
    throw ApiError.badRequest(
      `No active students in ${fromGrade} ${fromSection}${studentIds?.length ? " among the ones selected" : ""}.`
    );
  }

  /**
   * What the students will be taught next, taken from the destination class.
   *
   * Not copied from what they took last year. `Subject` is already per-grade,
   * so "Grade 9" *is* a curriculum — and reading it means a Grade 8 subject can
   * never follow a child into Grade 9 by accident, which copying would allow the
   * moment a school renamed or retired one.
   *
   * A retained student repeats a year, so their destination grade is the one
   * they are already in and they are enrolled in its curriculum again. That is
   * one rule rather than two, and it means a subject the school has added since
   * reaches the repeating student as well.
   *
   * A graduating student is taught nothing next; there is no destination.
   */
  const curriculum = outcome === "GRADUATED"
    ? []
    : await prisma.subject.findMany({
        where: { instituteId: institute.id, grade: toGrade },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

  const moves = students.map((s) => ({
    studentId: s.id,
    name: s.name,
    rollNo: s.rollNo,
    from: `${s.grade} ${s.section}`,
    to: outcome === "GRADUATED" ? null : `${toGrade} ${toSection}`,
    outcome,
    subjects: curriculum.map((c) => c.name),
  }));

  if (dryRun) {
    return ok(
      res,
      {
        dryRun: true,
        fromSession,
        toSession,
        outcome,
        students: moves.length,
        moves,
        curriculum: curriculum.map((c) => c.name),
        enrolmentsToCreate: moves.length * curriculum.length,
      },
      `${count(moves.length,"student")} would move from ${fromGrade} ${fromSection} into ${toSession}` +
        (outcome === "GRADUATED"
          ? "."
          : curriculum.length
            ? `, each taking ${count(curriculum.length,"subject")}: ${curriculum.map((c) => c.name).join(", ")}.`
            : `. ${toGrade} has no subjects yet, so they will move but take nothing until you add some.`)
    );
  }

  /**
   * The session being promoted into, created here if the school has not
   * reached it yet.
   *
   * Promotion runs *before* the school declares the new year — a school moves
   * its classes up over several days and closes the year once every class is
   * dealt with. So the year being promoted into is usually still in the future,
   * and it has to exist for its enrolments to point at. It is created without
   * `isCurrent`: this records what will be taught, not what the school is
   * running today.
   */
  const span = defaultSpan(toSession, 4);
  if (!span) throw ApiError.badRequest(`"${toSession}" is not a session this can date.`);

  const destination = await prisma.academicSession.upsert({
    where: { instituteId_name: { instituteId: institute.id, name: toSession } },
    create: { instituteId: institute.id, name: toSession, ...span, isCurrent: false },
    update: {},
  });

  /**
   * One transaction for the lot. A half-promoted class — some students in the
   * new grade, some in the old, and a promotion log that matches neither — is
   * far worse than a failed promotion.
   */
  await prisma.$transaction(async (tx) => {
    for (const s of students) {
      await tx.studentPromotion.create({
        data: {
          studentId: s.id,
          instituteId: institute.id,
          fromSession,
          toSession,
          fromGrade: s.grade,
          fromSection: s.section,
          toGrade: outcome === "GRADUATED" ? null : toGrade,
          toSection: outcome === "GRADUATED" ? null : toSection,
          outcome,
          notes: notes ?? null,
          promotedById: req.user.id,
        },
      });

      await tx.student.update({
        where: { id: s.id },
        data:
          outcome === "GRADUATED"
            ? { status: "GRADUATED" }
            : outcome === "RETAINED"
              ? {} // stays exactly where it is; the record says why
              : { grade: toGrade, section: toSection },
      });

      /**
       * The new year's enrolments, one per subject of the destination class.
       *
       * Nothing from last year is touched: its enrolments keep their own
       * session, and the marks, attendance and invoices hanging off them are
       * never read by this. A promoted student ends the transaction holding two
       * sets of enrolments — last year's, complete with its results, and this
       * year's, empty until somebody marks it.
       */
      if (curriculum.length) {
        await tx.enrollment.createMany({
          data: curriculum.map((c) => ({
            studentId: s.id,
            subjectId: c.id,
            academicSessionId: destination.id,
          })),
          // A class promoted twice by mistake must not double-enrol anyone.
          skipDuplicates: true,
        });
      }
    }
  });

  audit(req, {
    action: "student.promote",
    entity: "Student",
    meta: { fromGrade, fromSection, toGrade, toSection, fromSession, toSession, outcome, count: students.length },
  });

  const verb =
    outcome === "GRADUATED" ? "graduated" : outcome === "RETAINED" ? "retained in" : `moved to ${toGrade} ${toSection}`;

  return ok(
    res,
    {
      dryRun: false,
      fromSession,
      toSession,
      outcome,
      students: moves.length,
      moves,
      curriculum: curriculum.map((c) => c.name),
      enrolmentsCreated: moves.length * curriculum.length,
    },
    `${count(students.length,"student")} ${outcome === "RETAINED" ? `${verb} ${fromGrade} ${fromSection}` : verb} for ${toSession}.`
  );
});

/**
 * GET /api/students/:id/promotions — where this student has been.
 *
 * The class history the in-place grade change would otherwise have erased.
 */
export const studentPromotions = asyncHandler(async (req, res) => {
  const student = await findAccessibleStudent(req, req.params.id);

  const history = await prisma.studentPromotion.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    include: { promotedBy: { select: { id: true, name: true } } },
  });

  return ok(res, history);
});

/**
 * DELETE /api/students/:id/purge — destroy a removed student for good.
 *
 * The recycle bin only ever hid the row. Everything about them stayed exactly
 * where it was, which is what let a restore be honest. This is the other door,
 * and it is the only one in the product that really loses something.
 *
 * It refuses anyone who is not already in the bin, so this cannot be reached
 * from the roster by mistake, and it counts what it is about to destroy so the
 * confirmation can name the real cost instead of warning in the abstract.
 */
export const purgeStudent = asyncHandler(async (req, res) => {
  const student = await prismaRaw.student.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId },
    select: {
      id: true, name: true, deletedAt: true,
      _count: { select: { enrollments: true, attendance: true, feeInvoices: true } },
    },
  });

  if (!student) throw ApiError.notFound("Student not found");
  if (!student.deletedAt) {
    throw ApiError.badRequest(
      `${student.name} is still on the roster. Remove them first — permanent deletion only applies to the recycle bin.`
    );
  }

  // Marks, registers and challans are the child's; they go with the child.
  const destroyed = {
    enrollments: student._count.enrollments,
    attendance: student._count.attendance,
    feeInvoices: student._count.feeInvoices,
  };
  await prismaRaw.student.delete({ where: { id: student.id } });

  audit(req, {
    action: "student.purge", entity: "Student", entityId: student.id,
    meta: { name: student.name, ...destroyed },
  });
  return ok(res, destroyed, `${student.name} has been deleted permanently.`);
});
