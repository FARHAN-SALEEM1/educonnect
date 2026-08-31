import { prisma, prismaRaw } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { nextTeacherCode } from "../utils/codes.js";
import crypto from "node:crypto";
import { hashPassword } from "../utils/password.js";
import { audit } from "../utils/audit.js";
import { sendWelcome, notSent, undeliveredReason } from "../services/email.service.js";
import { notificationEnabled } from "../utils/notifications.js";
import { attendanceSummary, averageScore } from "../utils/academics.js";
import { policyFor } from "../services/grading.service.js";
import { liveEnrolmentFilter, readSessionId, sessionFilter } from "../services/session.service.js";

/** Counts the distinct grade-sections and students a teacher is responsible for. */
const teacherWorkload = async (teacherId) => {
  // Only the year the school is running. A workload counting last year's classes
  // would tell a teacher they hold twice what they do.
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { instituteId: true },
  });
  const sessionId = await readSessionId(teacher?.instituteId);

  const subjects = await prisma.subject.findMany({
    where: { teacherId },
    include: {
      enrollments: {
        where: liveEnrolmentFilter(sessionId),
        include: { student: { select: { id: true, grade: true, section: true } } },
      },
    },
  });

  const classes = new Set();
  const studentIds = new Set();
  for (const subject of subjects) {
    for (const e of subject.enrollments) {
      classes.add(`${e.student.grade.replace(/[^0-9]/g, "")}${e.student.section}`);
      studentIds.add(e.student.id);
    }
  }

  return {
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, grade: s.grade, color: s.color })),
    classes: [...classes].sort(),
    studentCount: studentIds.size,
  };
};

/** GET /api/teachers */
export const listTeachers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, isActive } = req.query;

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(isActive !== undefined && { isActive: isActive === "true" }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [total, teachers] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
      include: {
        subjects: { select: { id: true, name: true, grade: true, color: true } },
        user: { select: { id: true, email: true, isActive: true, lastLoginAt: true } },
        institute: { select: { id: true, name: true } },
      },
    }),
  ]);

  const data = await Promise.all(
    teachers.map(async (t) => {
      const workload = await teacherWorkload(t.id);
      return {
        ...t,
        subject: t.subjects[0]?.name ?? null, // primary subject, for compact list views
        classes: workload.classes,
        students: workload.studentCount,
      };
    })
  );

  return ok(res, data, "Teachers fetched", pageMeta(total, page, limit));
});

/** GET /api/teachers/:id */
export const getTeacher = asyncHandler(async (req, res) => {
  const where = { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) };

  const teacher = await prisma.teacher.findFirst({
    where,
    include: {
      subjects: {
        include: { _count: { select: { enrollments: true } } },
      },
      user: { select: { id: true, email: true, isActive: true, lastLoginAt: true, avatarUrl: true } },
      institute: { select: { id: true, name: true, code: true } },
      timetableSlots: {
        include: { subject: { select: { name: true, color: true } } },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      },
    },
  });

  if (!teacher) throw ApiError.notFound("Teacher not found");

  const workload = await teacherWorkload(teacher.id);

  return ok(res, {
    ...teacher,
    classes: workload.classes,
    students: workload.studentCount,
    subjects: teacher.subjects.map((s) => ({
      ...s,
      studentCount: s._count.enrollments,
      _count: undefined,
    })),
  });
});

/**
 * GET /api/teachers/me/classes
 * The teacher portal's "My Classes" tab — every class the signed-in
 * teacher owns, with the class average computed from live enrollments.
 */
export const myClasses = asyncHandler(async (req, res) => {
  /**
   * The school's own scale, not the platform's — the same letters the
   * result card prints, so a teacher and a parent read one grade.
   *
   * Taken from the signed-in teacher, not req.instituteId: this route scopes
   * itself by the teacher profile and never runs scopeToInstitute, so that
   * field is undefined here and the policy fell back to the platform default —
   * which is the very bug this whole change is about, one route further in.
   */
  const grading = await policyFor(req.user.instituteId);
  if (!req.user.teacherId) throw ApiError.forbidden("No teacher profile linked to your account");

  const rosterSessionId = await readSessionId(req.instituteId);

  const subjects = await prisma.subject.findMany({
    where: { teacherId: req.user.teacherId },
    include: {
      enrollments: {
        where: liveEnrolmentFilter(rosterSessionId),
        include: {
          student: {
            select: { id: true, name: true, grade: true, section: true, rollNo: true, code: true },
          },
          assessments: { select: { title: true } },
        },
      },
    },
  });

  // One attendance query for every student this teacher touches, rather than
  // one per class.
  const allStudentIds = [
    ...new Set(subjects.flatMap((s) => s.enrollments.map((e) => e.student.id))),
  ];
  const attendanceRows = allStudentIds.length
    ? await prisma.attendance.findMany({
        where: { studentId: { in: allStudentIds } },
        select: { studentId: true, status: true },
      })
    : [];

  const attendanceByStudent = new Map();
  for (const row of attendanceRows) {
    if (!attendanceByStudent.has(row.studentId)) attendanceByStudent.set(row.studentId, []);
    attendanceByStudent.get(row.studentId).push(row);
  }

  // Group enrollments into grade-section buckets per subject.
  const classes = [];
  for (const subject of subjects) {
    const buckets = new Map();
    for (const e of subject.enrollments) {
      const key = `${e.student.grade}|${e.student.section}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(e);
    }

    for (const [key, enrollments] of buckets) {
      const [grade, section] = key.split("|");

      const classAttendance = enrollments.flatMap(
        (e) => attendanceByStudent.get(e.student.id) ?? []
      );

      // Distinct assessment titles — "Quiz 3" sat by 20 students is one assessment.
      const assessmentTitles = new Set(
        enrollments.flatMap((e) => e.assessments.map((a) => a.title))
      );

      classes.push({
        subjectId: subject.id,
        subject: subject.name,
        color: subject.color,
        grade,
        section,
        label: `${grade.replace(/[^0-9]/g, "")}${section}`,
        studentCount: enrollments.length,
        average: averageScore(enrollments),
        attendanceRate: attendanceSummary(classAttendance).rate,
        assessmentCount: assessmentTitles.size,
        students: enrollments.map((e) => ({
          ...e.student,
          enrollmentId: e.id,
          score: e.currentScore,
          previousScore: e.previousScore,
          // The live policy, not the letter cached when this was last marked.
          letterGrade: grading.letterGrade(e.currentScore),
          attendanceRate: attendanceSummary(attendanceByStudent.get(e.student.id) ?? []).rate,
        })),
      });
    }
  }

  classes.sort((a, b) => a.label.localeCompare(b.label) || a.subject.localeCompare(b.subject));

  return ok(res, classes);
});

/** POST /api/teachers */
export const createTeacher = asyncHandler(async (req, res) => {
  const { createLogin = true, password, subjectIds, instituteId: _ignored, ...data } = req.body;
  const instituteId = req.instituteId;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing && createLogin) throw ApiError.conflict("A user with this email already exists");

  const code = await nextTeacherCode(instituteId);
  const tempPassword = password || `EC-${crypto.randomBytes(4).toString("hex")}`;

  const teacher = await prisma.$transaction(async (tx) => {
    let userId = null;

    if (createLogin) {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          passwordHash: await hashPassword(tempPassword),
          role: "TEACHER",
          instituteId,
        },
      });
      userId = user.id;
    }

    const record = await tx.teacher.create({
      data: { ...data, code, instituteId, userId },
    });

    if (subjectIds?.length) {
      await tx.subject.updateMany({
        where: { id: { in: subjectIds }, instituteId },
        data: { teacherId: record.id },
      });
    }

    return record;
  });

  audit(req, { action: "teacher.create", entity: "Teacher", entityId: teacher.id });

  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: { name: true, notificationSettings: true },
  });

  // Honours the "Welcome emails" toggle rather than always sending.
  //
  // The result is kept, not discarded. A generated password that was never
  // delivered has to be shown on screen instead — otherwise the account exists
  // and nobody, including the admin who just created it, knows how to sign in.
  const needsMail = createLogin && !password;
  const delivery = !needsMail
    ? notSent("not-applicable")
    : !notificationEnabled(institute, "welcomeEmails")
      ? notSent("welcome-emails-off")
      : await sendWelcome({
          to: teacher.email,
          name: teacher.name,
          role: "teacher",
          instituteName: institute?.name ?? "EduConnect",
          tempPassword,
          loginUrl: `${env.appUrl}/`,
        });

  return created(
    res,
    { ...teacher, emailed: delivery.delivered },
    !createLogin
      ? `${teacher.name} added`
      : password
        ? `${teacher.name} added with the password you set.`
        : delivery.delivered
          ? `${teacher.name} added — sign-in details sent to ${teacher.email}.`
          : `${teacher.name} added. Temporary password: ${tempPassword} (${undeliveredReason(delivery.reason)}).`
  );
});

/** PATCH /api/teachers/:id */
export const updateTeacher = asyncHandler(async (req, res) => {
  const existing = await prisma.teacher.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Teacher not found");

  const { subjectIds, password, instituteId: _ignored, ...data } = req.body;

  const teacher = await prisma.$transaction(async (tx) => {
    const record = await tx.teacher.update({ where: { id: existing.id }, data });

    // Keep the linked login in step with the profile.
    if (existing.userId && (data.name || data.email || data.phone || data.isActive !== undefined)) {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.email && { email: data.email }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });
    }

    if (subjectIds) {
      // Release previously-owned subjects, then claim the new set.
      await tx.subject.updateMany({
        where: { teacherId: existing.id },
        data: { teacherId: null },
      });
      if (subjectIds.length) {
        await tx.subject.updateMany({
          where: { id: { in: subjectIds }, instituteId: existing.instituteId },
          data: { teacherId: existing.id },
        });
      }
    }

    return record;
  });

  audit(req, { action: "teacher.update", entity: "Teacher", entityId: teacher.id });
  return ok(res, teacher, "Teacher updated");
});

/** DELETE /api/teachers/:id */
export const deleteTeacher = asyncHandler(async (req, res) => {
  const teacher = await prisma.teacher.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!teacher) throw ApiError.notFound("Teacher not found");

  // Soft delete: the teacher disappears from the school, but their marks and
  // the audit trail of who recorded them stay intact.
  /**
   * Everything that named them has to stop naming them.
   *
   * Only subjects were released here, so the periods they taught kept pointing
   * at them. A soft delete never fires the schema own onDelete: SetNull, and
   * the timetable reads the teacher through a nested include, which the
   * soft-delete extension does not reach — so the schedule went on printing
   * someone who had left, and conflictsFor matches the scalar teacherId, so it
   * went on defending their periods against the colleague taking over.
   */
  let freedPeriods = 0;
  await prisma.$transaction(async (tx) => {
    await tx.subject.updateMany({ where: { teacherId: teacher.id }, data: { teacherId: null } });
    freedPeriods = (
      await tx.timetableSlot.updateMany({
        where: { teacherId: teacher.id },
        data: { teacherId: null },
      })
    ).count;
    await tx.teacher.update({
      where: { id: teacher.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    // Their login is disabled rather than deleted, so authored records keep
    // their author.
    if (teacher.userId) {
      await tx.user.update({ where: { id: teacher.userId }, data: { isActive: false } });
    }
  });

  audit(req, {
    action: "teacher.delete",
    entity: "Teacher",
    entityId: teacher.id,
    meta: { name: teacher.name, soft: true, freedPeriods },
  });

  return ok(
    res,
    null,
    `${teacher.name} removed. Their subjects are now unassigned` +
      (freedPeriods
        ? `, and ${freedPeriods} timetable period(s) now need a teacher.`
        : ".")
  );
});

/** GET /api/teachers/deleted */
export const listDeletedTeachers = asyncHandler(async (req, res) => {
  const teachers = await prismaRaw.teacher.findMany({
    where: { instituteId: req.instituteId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: { id: true, code: true, name: true, email: true, deletedAt: true },
  });
  return ok(res, teachers);
});

/** POST /api/teachers/:id/restore */
export const restoreTeacher = asyncHandler(async (req, res) => {
  const teacher = await prismaRaw.teacher.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId },
  });

  if (!teacher) throw ApiError.notFound("Teacher not found");
  if (!teacher.deletedAt) throw ApiError.badRequest("That teacher is not deleted");

  await prismaRaw.$transaction(async (tx) => {
    await tx.teacher.update({
      where: { id: teacher.id },
      data: { deletedAt: null, isActive: true },
    });
    if (teacher.userId) {
      await tx.user.update({ where: { id: teacher.userId }, data: { isActive: true } });
    }
  });

  audit(req, { action: "teacher.restore", entity: "Teacher", entityId: teacher.id });
  return ok(res, null, `${teacher.name} restored. Re-assign their subjects as needed.`);
});

/**
 * DELETE /api/teachers/:id/purge — destroy a removed teacher for good.
 *
 * The recycle bin only ever hid the row. Everything about them stayed exactly
 * where it was, which is what let a restore be honest. This is the other door,
 * and it is the only one in the product that really loses something.
 *
 * It refuses anyone who is not already in the bin, so this cannot be reached
 * from the staff list by mistake, and it counts what it is about to destroy so the
 * confirmation can name the real cost instead of warning in the abstract.
 */
export const purgeTeacher = asyncHandler(async (req, res) => {
  const teacher = await prismaRaw.teacher.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId },
    select: {
      id: true, name: true, deletedAt: true, userId: true,
      _count: { select: { subjects: true, timetableSlots: true } },
    },
  });

  if (!teacher) throw ApiError.notFound("Teacher not found");
  if (!teacher.deletedAt) {
    throw ApiError.badRequest(
      `${teacher.name} is still on the staff list. Remove them first — permanent deletion only applies to the recycle bin.`
    );
  }

  // Their subjects and periods survive them, unassigned — a class is not the
  // teacher's property. Only the person and their login go.
  const destroyed = {
    subjectsUnassigned: teacher._count.subjects,
    periodsUnassigned: teacher._count.timetableSlots,
  };
  await prismaRaw.$transaction(async (tx) => {
    await tx.teacher.delete({ where: { id: teacher.id } });
    if (teacher.userId) await tx.user.delete({ where: { id: teacher.userId } });
  });

  audit(req, {
    action: "teacher.purge", entity: "Teacher", entityId: teacher.id,
    meta: { name: teacher.name, ...destroyed },
  });
  return ok(res, destroyed, `${teacher.name} has been deleted permanently.`);
});
