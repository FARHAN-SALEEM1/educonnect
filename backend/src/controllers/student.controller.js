import { prisma, prismaRaw } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { nextStudentCode } from "../utils/codes.js";
import { audit } from "../utils/audit.js";
import { findAccessibleStudent, studentScopeWhere } from "../utils/access.js";
import {
  attendanceSummary,
  averageScore,
  calculateGpa,
  classRank,
  letterGrade,
  predictScore,
} from "../utils/academics.js";
import { generateInsightsForStudent } from "../services/insight.service.js";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** GET /api/students */
export const listStudents = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, grade, section, status, parentId, sortBy = "name", order = "asc" } = req.query;

  const scope = await studentScopeWhere(req);
  const where = {
    ...scope,
    ...(grade && { grade }),
    ...(section && { section }),
    ...(status && { status }),
    ...(parentId && { parentId }),
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
      orderBy: { [sortBy]: order },
      include: {
        parent: { select: { id: true, name: true, phone: true, email: true, relation: true } },
        enrollments: {
          select: {
            currentScore: true,
            previousScore: true,
            letterGrade: true,
            subject: { select: { id: true, name: true, color: true } },
          },
        },
        institute: { select: { id: true, name: true, code: true } },
        feeInvoices: { orderBy: { period: "desc" }, take: 12 },
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

  // Rank is computed across the whole scoped cohort, not just this page —
  // a page-local rank would be meaningless once you turn to page two.
  const cohort = await prisma.student.findMany({
    where: { ...scope, status: "ACTIVE" },
    select: { id: true, grade: true, section: true, enrollments: { select: { currentScore: true } } },
  });

  const rankByStudent = new Map();
  const classSizeByStudent = new Map();
  const classes = new Map();
  for (const c of cohort) {
    const key = `${c.grade}|${c.section}`;
    if (!classes.has(key)) classes.set(key, []);
    classes.get(key).push({ id: c.id, average: averageScore(c.enrollments) });
  }
  for (const members of classes.values()) {
    members.sort((a, b) => b.average - a.average);
    members.forEach((m, i) => {
      rankByStudent.set(m.id, i + 1);
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

      gpa: calculateGpa(s.enrollments),
      average: averageScore(s.enrollments),
      rank: rankByStudent.get(s.id) ?? null,
      classSize: classSizeByStudent.get(s.id) ?? 0,
      topScore: best?.currentScore ?? null,
      topSubject: best?.subject.name ?? null,
      topSubjectColor: best?.subject.color ?? null,
      subjectCount: s.enrollments.length,
      subjects: s.enrollments.map((e) => ({
        subjectId: e.subject.id,
        name: e.subject.name,
        color: e.subject.color,
        score: e.currentScore,
        previousScore: e.previousScore,
        grade: e.letterGrade,
      })),

      attendance: attendanceSummary(records),
      weekAttendance: records
        .slice(0, 5)
        .reverse()
        .map((a) => ({
          date: a.date,
          day: DAY_LABELS[new Date(a.date).getDay()],
          status: a.status,
        })),

      fees: s.feeInvoices,
      duesOutstanding: s.feeInvoices
        .filter((f) => f.status === "PENDING" || f.status === "OVERDUE")
        .reduce((sum, f) => sum + (f.amount - f.discount + f.lateFee), 0),
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
  const student = await findAccessibleStudent(req, req.params.id, {
    parent: true,
    institute: { select: { id: true, name: true, code: true, logo: true, color: true } },
    enrollments: {
      include: {
        subject: { include: { teacher: { select: { id: true, name: true } } } },
        assessments: { orderBy: { takenOn: "desc" }, take: 10 },
      },
    },
    feeInvoices: { orderBy: { period: "desc" } },
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
    select: { id: true, enrollments: { select: { currentScore: true } } },
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
    grade: e.letterGrade ?? letterGrade(e.currentScore),
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

  const feeSummary = student.feeInvoices.reduce(
    (acc, f) => {
      const net = f.amount - f.discount + f.lateFee;
      if (f.status === "PAID") acc.paid += f.paidAmount ?? net;
      else if (f.status !== "WAIVED") acc.outstanding += net;
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

    gpa: calculateGpa(student.enrollments),
    average: averageScore(student.enrollments),
    rank,
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
  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    include: { plan: true, _count: { select: { students: true } } },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  if (institute._count.students >= institute.plan.maxStudents) {
    throw ApiError.badRequest(
      `Student limit reached. The ${institute.plan.name} plan allows ${institute.plan.maxStudents} students — upgrade the plan to add more.`
    );
  }

  if (data.parentId) {
    const parent = await prisma.parent.findFirst({
      where: { id: data.parentId, instituteId },
    });
    if (!parent) throw ApiError.badRequest("Selected parent does not belong to this institute");
  }

  const code = await nextStudentCode(instituteId);

  const student = await prisma.student.create({
    data: {
      ...data,
      code,
      instituteId,
      dob: data.dob ? new Date(data.dob) : null,
      ...(subjectIds?.length && {
        enrollments: { create: subjectIds.map((subjectId) => ({ subjectId })) },
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

  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    include: { plan: true, _count: { select: { students: true } } },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  const seats = institute.plan.maxStudents - institute._count.students;
  if (rows.length > seats) {
    throw ApiError.badRequest(
      `This import has ${rows.length} students but only ${seats} seat(s) remain on the ${institute.plan.name} plan. Upgrade the plan or import fewer.`
    );
  }

  // Existing roll numbers, so duplicates are reported rather than thrown by
  // the database one row at a time.
  const existing = await prisma.student.findMany({
    where: { instituteId },
    select: { rollNo: true },
  });
  const takenRolls = new Set(existing.map((s) => s.rollNo));

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
    if (roll && seenRolls.has(roll)) problems.push(`roll number "${roll}" is duplicated in this file`);

    if (row.guardianEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.guardianEmail.trim())) {
      problems.push("guardianEmail is not a valid email");
    }
    if (row.dob && Number.isNaN(new Date(row.dob).getTime())) {
      problems.push("dob is not a valid date (use YYYY-MM-DD)");
    }

    if (problems.length) {
      errors.push({ line, name: row.name ?? "(blank)", problems });
      return;
    }

    seenRolls.add(roll);
    valid.push({ ...row, rollNo: roll, line });
  });

  if (errors.length && !partial) {
    throw ApiError.unprocessable(
      `${errors.length} of ${rows.length} row(s) have problems — nothing was imported. Fix them, or re-send with partial=true to import the ${valid.length} valid row(s).`,
      errors
    );
  }

  if (!valid.length) throw ApiError.badRequest("No valid rows to import", errors);

  const startCount = institute._count.students;
  const pad = (n) => String(n).padStart(3, "0");

  const result = await prisma.$transaction(async (tx) => {
    // Reuse a guardian across siblings instead of creating duplicates.
    const parentByEmail = new Map();
    if (createParents) {
      const emails = [...new Set(valid.map((r) => r.guardianEmail?.trim()).filter(Boolean))];
      if (emails.length) {
        const found = await tx.parent.findMany({
          where: { instituteId, email: { in: emails } },
        });
        for (const p of found) parentByEmail.set(p.email, p);
      }
    }

    let parentSeq = await tx.parent.count({ where: { instituteId } });
    // Not named `created` — that's the response helper imported above.
    const madeStudents = [];

    for (const [i, row] of valid.entries()) {
      let parentId = null;

      if (createParents && row.guardianEmail?.trim()) {
        const email = row.guardianEmail.trim();
        let parent = parentByEmail.get(email);

        if (!parent) {
          parentSeq += 1;
          parent = await tx.parent.create({
            data: {
              code: `PAR${pad(parentSeq)}`,
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
          code: `STU${pad(startCount + i + 1)}`,
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
    `Imported ${result.madeStudents.length} student(s)${errors.length ? `, skipped ${errors.length}` : ""}.`
  );
});

/** PATCH /api/students/:id */
export const updateStudent = asyncHandler(async (req, res) => {
  await findAccessibleStudent(req, req.params.id);

  const { subjectIds, instituteId: _ignored, ...data } = req.body;
  if (data.dob) data.dob = new Date(data.dob);

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
  const student = await findAccessibleStudent(req, req.params.id, {
    institute: { select: { name: true, city: true, logo: true } },
    parent: { select: { name: true, phone: true, email: true, relation: true } },
    enrollments: {
      include: {
        subject: { include: { teacher: { select: { name: true } } } },
        assessments: { orderBy: { takenOn: "asc" } },
      },
    },
    feeInvoices: { orderBy: { period: "asc" } },
  });

  const attendance = await prisma.attendance.findMany({
    where: { studentId: student.id },
    orderBy: { date: "asc" },
  });

  return ok(res, {
    generatedAt: new Date(),
    institute: student.institute,
    student: {
      code: student.code,
      name: student.name,
      grade: student.grade,
      section: student.section,
      rollNo: student.rollNo,
      dob: student.dob,
      bloodGroup: student.bloodGroup,
    },
    parent: student.parent,
    gpa: calculateGpa(student.enrollments),
    average: averageScore(student.enrollments),
    subjects: student.enrollments.map((e) => ({
      name: e.subject.name,
      teacher: e.subject.teacher?.name ?? null,
      score: e.currentScore,
      previousScore: e.previousScore,
      grade: e.letterGrade ?? letterGrade(e.currentScore),
      assessments: e.assessments,
    })),
    attendance: attendanceSummary(attendance),
    fees: student.feeInvoices,
  });
});

