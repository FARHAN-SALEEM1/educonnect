import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { recalcEnrollment } from "../services/grading.service.js";
import { findAccessibleSubject } from "../utils/access.js";

/** Where-clause that keeps teachers to their own subjects. */
const scopeWhere = (req) => ({
  ...(req.instituteId && { enrollment: { student: { instituteId: req.instituteId } } }),
  ...(req.user.role === "TEACHER" && {
    enrollment: {
      ...(req.instituteId && { student: { instituteId: req.instituteId } }),
      subject: { teacherId: req.user.teacherId },
    },
  }),
  ...(req.user.role === "PARENT" && {
    enrollment: { student: { parentId: req.user.parentId } },
  }),
});

/** GET /api/assessments */
export const listAssessments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { studentId, subjectId, type, from, to } = req.query;

  const where = {
    ...scopeWhere(req),
    ...(type && { type }),
    ...((from || to) && {
      takenOn: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
  };

  if (studentId || subjectId) {
    where.enrollment = {
      ...(where.enrollment || {}),
      ...(studentId && { studentId }),
      ...(subjectId && { subjectId }),
    };
  }

  const [total, assessments] = await Promise.all([
    prisma.assessment.count({ where }),
    prisma.assessment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { takenOn: "desc" },
      include: {
        enrollment: {
          include: {
            student: { select: { id: true, name: true, rollNo: true, grade: true, section: true } },
            subject: { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
  ]);

  const data = assessments.map((a) => ({
    id: a.id,
    title: a.title,
    type: a.type,
    obtained: a.obtained,
    total: a.total,
    percentage: Number(((a.obtained / a.total) * 100).toFixed(1)),
    takenOn: a.takenOn,
    remarks: a.remarks,
    student: a.enrollment.student,
    subject: a.enrollment.subject,
  }));

  return ok(res, data, "Assessments fetched", pageMeta(total, page, limit));
});

/** POST /api/assessments — record one mark. */
export const createAssessment = asyncHandler(async (req, res) => {
  const { studentId, subjectId, ...data } = req.body;

  await findAccessibleSubject(req, subjectId);

  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_subjectId: { studentId, subjectId } },
  });
  if (!enrollment) {
    throw ApiError.badRequest("This student is not enrolled in that subject");
  }

  const assessment = await prisma.assessment.create({
    data: { ...data, enrollmentId: enrollment.id },
  });

  // Roll the new mark into the student's subject score.
  await recalcEnrollment(enrollment.id);

  audit(req, { action: "assessment.create", entity: "Assessment", entityId: assessment.id });
  return created(res, assessment, "Assessment recorded");
});

/**
 * POST /api/assessments/bulk
 * Enter one assessment for a whole class in a single request — the flow
 * behind the teacher portal's "+ Add Assessment" button.
 */
export const bulkCreateAssessments = asyncHandler(async (req, res) => {
  const { subjectId, title, type, total, takenOn, results } = req.body;

  await findAccessibleSubject(req, subjectId);

  const studentIds = results.map((r) => r.studentId);
  const enrollments = await prisma.enrollment.findMany({
    where: { subjectId, studentId: { in: studentIds } },
    select: { id: true, studentId: true },
  });

  const enrollmentByStudent = new Map(enrollments.map((e) => [e.studentId, e.id]));

  const skipped = [];
  const rows = [];

  for (const r of results) {
    const enrollmentId = enrollmentByStudent.get(r.studentId);
    if (!enrollmentId) {
      skipped.push({ studentId: r.studentId, reason: "not enrolled in this subject" });
      continue;
    }
    if (r.obtained > total) {
      skipped.push({ studentId: r.studentId, reason: `obtained (${r.obtained}) exceeds total (${total})` });
      continue;
    }
    rows.push({
      enrollmentId,
      title,
      type,
      total,
      obtained: r.obtained,
      remarks: r.remarks ?? null,
      ...(takenOn && { takenOn }),
    });
  }

  if (!rows.length) {
    throw ApiError.badRequest("No valid results to record", skipped);
  }

  await prisma.assessment.createMany({ data: rows });
  for (const row of rows) await recalcEnrollment(row.enrollmentId);

  audit(req, {
    action: "assessment.bulk_create",
    entity: "Assessment",
    meta: { subjectId, title, recorded: rows.length, skipped: skipped.length },
  });

  return created(
    res,
    { recorded: rows.length, skipped },
    `${title} recorded for ${rows.length} student(s)`
  );
});

/** PATCH /api/assessments/:id */
export const updateAssessment = asyncHandler(async (req, res) => {
  const existing = await prisma.assessment.findFirst({
    where: { id: req.params.id, ...scopeWhere(req) },
  });
  if (!existing) throw ApiError.notFound("Assessment not found");

  const obtained = req.body.obtained ?? existing.obtained;
  const total = req.body.total ?? existing.total;
  if (obtained > total) throw ApiError.badRequest("Obtained marks cannot exceed total marks");

  const assessment = await prisma.assessment.update({
    where: { id: existing.id },
    data: req.body,
  });

  await recalcEnrollment(existing.enrollmentId);

  return ok(res, assessment, "Assessment updated");
});

/** DELETE /api/assessments/:id */
export const deleteAssessment = asyncHandler(async (req, res) => {
  const existing = await prisma.assessment.findFirst({
    where: { id: req.params.id, ...scopeWhere(req) },
  });
  if (!existing) throw ApiError.notFound("Assessment not found");

  await prisma.assessment.delete({ where: { id: existing.id } });
  await recalcEnrollment(existing.enrollmentId);

  return ok(res, null, "Assessment deleted");
});

/**
 * GET /api/assessments/gradebook?subjectId=&grade=&section=
 * The teacher portal's grade book grid: one row per student, one column
 * per assessment title, plus the running average and letter grade.
 */
export const gradebook = asyncHandler(async (req, res) => {
  const { subjectId, grade, section } = req.query;
  if (!subjectId) throw ApiError.badRequest("subjectId is required");

  const subject = await findAccessibleSubject(req, subjectId);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      subjectId,
      student: {
        ...(grade && { grade }),
        ...(section && { section }),
        status: "ACTIVE",
      },
    },
    include: {
      student: { select: { id: true, name: true, rollNo: true, grade: true, section: true } },
      assessments: { orderBy: { takenOn: "asc" } },
    },
  });

  // Column headers = every distinct assessment title in this subject.
  const columns = [
    ...new Set(enrollments.flatMap((e) => e.assessments.map((a) => a.title))),
  ];

  const rows = enrollments
    .map((e) => {
      const marks = {};
      for (const title of columns) {
        const a = e.assessments.find((x) => x.title === title);
        marks[title] = a
          ? { obtained: a.obtained, total: a.total, percentage: Number(((a.obtained / a.total) * 100).toFixed(1)) }
          : null;
      }
      return {
        enrollmentId: e.id,
        student: e.student,
        marks,
        average: e.currentScore,
        previousScore: e.previousScore,
        letterGrade: e.letterGrade,
        trend:
          e.currentScore !== null && e.previousScore !== null
            ? Number((e.currentScore - e.previousScore).toFixed(1))
            : 0,
      };
    })
    .sort((a, b) => a.student.name.localeCompare(b.student.name));

  return ok(res, {
    subject: { id: subject.id, name: subject.name, color: subject.color, grade: subject.grade },
    columns,
    rows,
    classAverage: rows.length
      ? Number(
          (
            rows.reduce((s, r) => s + (r.average ?? 0), 0) /
            rows.filter((r) => r.average !== null).length || 0
          ).toFixed(1)
        )
      : 0,
  });
});
