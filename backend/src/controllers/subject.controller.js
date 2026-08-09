import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { averageScore, letterGrade, predictScore } from "../utils/academics.js";

/** GET /api/subjects */
export const listSubjects = asyncHandler(async (req, res) => {
  const { grade, teacherId, search } = req.query;

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(grade && { grade }),
    ...(teacherId && { teacherId }),
    // A teacher browsing subjects sees only their own.
    ...(req.user.role === "TEACHER" && { teacherId: req.user.teacherId }),
    ...(search && { name: { contains: search, mode: "insensitive" } }),
  };

  const subjects = await prisma.subject.findMany({
    where,
    orderBy: [{ grade: "asc" }, { name: "asc" }],
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      enrollments: { select: { currentScore: true } },
    },
  });

  return ok(
    res,
    subjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      grade: s.grade,
      color: s.color,
      teacher: s.teacher,
      studentCount: s.enrollments.length,
      average: averageScore(s.enrollments),
    }))
  );
});

/** GET /api/subjects/:id */
export const getSubject = asyncHandler(async (req, res) => {
  const subject = await prisma.subject.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      enrollments: {
        include: {
          student: { select: { id: true, name: true, grade: true, section: true, rollNo: true } },
          assessments: { orderBy: { takenOn: "desc" } },
        },
      },
    },
  });

  if (!subject) throw ApiError.notFound("Subject not found");

  return ok(res, {
    ...subject,
    average: averageScore(subject.enrollments),
    enrollments: subject.enrollments.map((e) => ({
      id: e.id,
      student: e.student,
      currentScore: e.currentScore,
      previousScore: e.previousScore,
      letterGrade: e.letterGrade ?? letterGrade(e.currentScore),
      predictedScore: e.predictedScore ?? predictScore(e.currentScore, e.previousScore),
      assessments: e.assessments,
    })),
  });
});

/** POST /api/subjects */
export const createSubject = asyncHandler(async (req, res) => {
  const { instituteId: _ignored, ...data } = req.body;

  if (data.teacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: data.teacherId, instituteId: req.instituteId },
    });
    if (!teacher) throw ApiError.badRequest("Selected teacher does not belong to this institute");
  }

  const subject = await prisma.subject.create({
    data: { ...data, instituteId: req.instituteId },
    include: { teacher: { select: { id: true, name: true } } },
  });

  audit(req, { action: "subject.create", entity: "Subject", entityId: subject.id });
  return created(res, subject, `${subject.name} added`);
});

/** PATCH /api/subjects/:id */
export const updateSubject = asyncHandler(async (req, res) => {
  const existing = await prisma.subject.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Subject not found");

  const { instituteId: _ignored, ...data } = req.body;

  const subject = await prisma.subject.update({
    where: { id: existing.id },
    data,
    include: { teacher: { select: { id: true, name: true } } },
  });

  audit(req, { action: "subject.update", entity: "Subject", entityId: subject.id });
  return ok(res, subject, "Subject updated");
});

/** DELETE /api/subjects/:id */
export const deleteSubject = asyncHandler(async (req, res) => {
  const subject = await prisma.subject.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { _count: { select: { enrollments: true } } },
  });
  if (!subject) throw ApiError.notFound("Subject not found");

  await prisma.subject.delete({ where: { id: subject.id } });

  audit(req, {
    action: "subject.delete",
    entity: "Subject",
    entityId: subject.id,
    meta: { name: subject.name, enrollmentsRemoved: subject._count.enrollments },
  });

  return ok(
    res,
    null,
    `${subject.name} deleted along with ${subject._count.enrollments} enrollment(s)`
  );
});

/** POST /api/subjects/enroll — enroll one student in one subject. */
export const enrollStudent = asyncHandler(async (req, res) => {
  const { studentId, subjectId, currentScore, previousScore } = req.body;

  const [student, subject] = await Promise.all([
    prisma.student.findFirst({ where: { id: studentId, instituteId: req.instituteId } }),
    prisma.subject.findFirst({ where: { id: subjectId, instituteId: req.instituteId } }),
  ]);

  if (!student) throw ApiError.notFound("Student not found in this institute");
  if (!subject) throw ApiError.notFound("Subject not found in this institute");

  const enrollment = await prisma.enrollment.upsert({
    where: { studentId_subjectId: { studentId, subjectId } },
    create: {
      studentId,
      subjectId,
      currentScore: currentScore ?? null,
      previousScore: previousScore ?? null,
      letterGrade: letterGrade(currentScore),
      predictedScore: predictScore(currentScore, previousScore),
    },
    update: {
      ...(currentScore !== undefined && {
        currentScore,
        letterGrade: letterGrade(currentScore),
        predictedScore: predictScore(currentScore, previousScore),
      }),
      ...(previousScore !== undefined && { previousScore }),
    },
    include: { subject: { select: { name: true } }, student: { select: { name: true } } },
  });

  return created(res, enrollment, `${enrollment.student.name} enrolled in ${enrollment.subject.name}`);
});

/** POST /api/subjects/enroll/bulk — cross-enroll a set of students into a set of subjects. */
export const bulkEnroll = asyncHandler(async (req, res) => {
  const { studentIds, subjectIds } = req.body;

  const [students, subjects] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds }, instituteId: req.instituteId },
      select: { id: true },
    }),
    prisma.subject.findMany({
      where: { id: { in: subjectIds }, instituteId: req.instituteId },
      select: { id: true },
    }),
  ]);

  if (!students.length) throw ApiError.badRequest("No valid students found in this institute");
  if (!subjects.length) throw ApiError.badRequest("No valid subjects found in this institute");

  const rows = students.flatMap((s) =>
    subjects.map((sub) => ({ studentId: s.id, subjectId: sub.id }))
  );

  const result = await prisma.enrollment.createMany({ data: rows, skipDuplicates: true });

  audit(req, {
    action: "enrollment.bulk_create",
    entity: "Enrollment",
    meta: { students: students.length, subjects: subjects.length, created: result.count },
  });

  return created(
    res,
    { requested: rows.length, created: result.count, skipped: rows.length - result.count },
    `${result.count} enrollment(s) created`
  );
});

/** PATCH /api/subjects/enrollments/:id — manual score override. */
export const updateEnrollment = asyncHandler(async (req, res) => {
  const existing = await prisma.enrollment.findFirst({
    where: {
      id: req.params.id,
      ...(req.instituteId && { student: { instituteId: req.instituteId } }),
      ...(req.user.role === "TEACHER" && { subject: { teacherId: req.user.teacherId } }),
    },
  });
  if (!existing) throw ApiError.notFound("Enrollment not found");

  const currentScore = req.body.currentScore ?? existing.currentScore;
  const previousScore = req.body.previousScore ?? existing.previousScore;

  const enrollment = await prisma.enrollment.update({
    where: { id: existing.id },
    data: {
      currentScore,
      previousScore,
      letterGrade: letterGrade(currentScore),
      predictedScore: predictScore(currentScore, previousScore),
    },
    include: { subject: { select: { name: true } }, student: { select: { name: true } } },
  });

  return ok(res, enrollment, "Score updated");
});

/** DELETE /api/subjects/enrollments/:id */
export const unenroll = asyncHandler(async (req, res) => {
  const existing = await prisma.enrollment.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { student: { instituteId: req.instituteId } }) },
  });
  if (!existing) throw ApiError.notFound("Enrollment not found");

  await prisma.enrollment.delete({ where: { id: existing.id } });
  return ok(res, null, "Student unenrolled from subject");
});
