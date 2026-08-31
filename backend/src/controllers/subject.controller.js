import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { currentSessionId, resolveSession } from "../services/session.service.js";
import { averageScore, predictScore } from "../utils/academics.js";
import { policyFor } from "../services/grading.service.js";
import { recalcSubject } from "../services/grading.service.js";
import { findAccessibleSubject } from "../utils/access.js";
import { count } from "../utils/plural.js";

/**
 * POST /api/subjects/:id/recalculate
 *
 * Rebuilds every enrolment's score in this subject from its own marks.
 *
 * A subject score has two writers: assessments, which recompute it, and
 * Quick Grade Entry, which sets it by hand. Both are legitimate — a term
 * grade is rarely the plain mean of a term's quizzes — but the last write
 * wins silently, so a recorded score can end up contradicting the marks
 * sitting under it. `marksAverage` on the gradebook and the result card now
 * shows when that has happened; this is how an admin resolves it.
 *
 * Open to the subject's own teacher as well as an admin. A teacher can
 * already write any score they like through Quick Grade Entry — including
 * the marks average — so recalculating is strictly less powerful than what
 * they can do already, and it belongs on the screen where the divergence is
 * created and seen. `findAccessibleSubject` keeps a teacher to their own
 * subjects and everyone to their own institute.
 */
export const recalculateSubject = asyncHandler(async (req, res) => {
  const subject = await findAccessibleSubject(req, req.params.id);

  const updated = await recalcSubject(subject.id);

  audit(req, {
    action: "subject.recalculate",
    entity: "Subject",
    entityId: subject.id,
    meta: { name: subject.name, enrollments: updated },
  });

  return ok(
    res,
    { subjectId: subject.id, enrollments: updated },
    `${subject.name}: ${count(updated,"enrolment")} recalculated from their marks.`
  );
});

/** GET /api/subjects */
/**
 * The session a subject screen is about.
 *
 * `?session=2026-27` reaches a past year; nothing named means the year the
 * school is running. A roster that quietly mixed years would put last year's
 * students in this year's class list.
 */
const sessionFor = async (req) => resolveSession(req.instituteId, req.query.session);

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
      // Only this year's roster: a class list that quietly carried last
      // year's students would put a promoted child back in Grade 8.
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

  /**
   * The gradebook's letters on the school's own scale.
   *
   * Only the result card used to ask the school; everything else graded on the
   * platform default, so a school's own bands stopped at one screen.
   */
  const grading = await policyFor(subject.instituteId);

  return ok(res, {
    ...subject,
    average: averageScore(subject.enrollments),
    enrollments: subject.enrollments.map((e) => ({
      id: e.id,
      student: e.student,
      currentScore: e.currentScore,
      previousScore: e.previousScore,
      // Computed from the live policy rather than read from the stored
      // letter, which was written under whatever scale was in force then —
      // so changing the scale takes effect here at once.
      letterGrade: grading.letterGrade(e.currentScore),
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

  /**
   * A subject is not soft-deleted, and the cascade runs all the way down:
   * Subject to Enrollment to Assessment. Removing "Computer Sc." therefore
   * erased every mark ever recorded in it, for every student, in every year
   * — silently, irreversibly, and with no recycle bin to undo it from. The
   * confirmation it returned only ever mentioned enrolments.
   *
   * A school that stops teaching a subject does not need to delete it:
   * enrolments come from the destination class's curriculum at promotion,
   * so a subject left in place simply stops following anyone forward.
   */
  const marks = await prisma.assessment.count({
    where: { enrollment: { subjectId: subject.id } },
  });
  if (marks) {
    throw ApiError.conflict(
      `${subject.name} has ${count(marks,"recorded mark")}, so it cannot be deleted — ` +
        `that would erase them from every result card, including past years. ` +
        `A subject that is no longer taught can be left in place: next year's ` +
        `enrolments come from the new class's subjects, so it will not follow ` +
        `anyone forward.`
    );
  }

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
    `${subject.name} deleted along with ${count(subject._count.enrollments,"enrollment")}`
  );
});

/** POST /api/subjects/enroll — enroll one student in one subject. */
/**
 * Marks are the only thing that sets a subject score.
 *
 * These two routes used to accept `currentScore` and write it straight to the
 * enrolment, alongside `recalcEnrollment` deriving the same field from real
 * assessments. Two writers, no way to tell which produced a number, and no way
 * to defend a result card against a parent holding their child's test paper.
 * The score is now a derived cache; anyone with an older client is told where
 * to put the mark instead of having it silently dropped.
 */
const SCORE_IS_DERIVED =
  "Subject scores come from marks now. Record the mark with POST /api/assessments and the score follows.";

export const enrollStudent = asyncHandler(async (req, res) => {
  const { studentId, subjectId, currentScore, previousScore } = req.body;

  if (currentScore !== undefined && currentScore !== null) {
    throw ApiError.badRequest(SCORE_IS_DERIVED);
  }

  const [student, subject] = await Promise.all([
    prisma.student.findFirst({ where: { id: studentId, instituteId: req.instituteId } }),
    prisma.subject.findFirst({ where: { id: subjectId, instituteId: req.instituteId } }),
  ]);

  if (!student) throw ApiError.notFound("Student not found in this institute");
  if (!subject) throw ApiError.notFound("Subject not found in this institute");

  /**
   * Enrolling always happens in the year the school is running.
   *
   * Reading may look at any year, but a new enrolment belongs to today's —
   * and one with no session at all would be invisible to every session-scoped
   * screen, which is a worse failure than refusing to make it.
   */
  const academicSessionId = await currentSessionId(req.instituteId);

  const enrollment = await prisma.enrollment.upsert({
    // Keyed by year as well as subject, so enrolling a repeating student in a
    // subject they took last year creates this year's enrolment instead of
    // overwriting the one their old result hangs from.
    where: {
      studentId_subjectId_academicSessionId: { studentId, subjectId, academicSessionId },
    },
    create: {
      studentId,
      subjectId,
      academicSessionId,
      // No marks yet, so no score. It appears the moment one is recorded.
      currentScore: null,
      previousScore: previousScore ?? null,
      letterGrade: null,
      predictedScore: null,
    },
    // `previousScore` is last session's carried-forward snapshot, not a
    // function of this term's marks, so it stays writable.
    update: { ...(previousScore !== undefined && { previousScore }) },
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

  const academicSessionId = await currentSessionId(req.instituteId);

  const rows = students.flatMap((s) =>
    subjects.map((sub) => ({ studentId: s.id, subjectId: sub.id, academicSessionId }))
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
    `${count(result.count,"enrollment")} created`
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

  if (req.body.currentScore !== undefined && req.body.currentScore !== null) {
    throw ApiError.badRequest(SCORE_IS_DERIVED);
  }

  const previousScore = req.body.previousScore ?? existing.previousScore;

  const enrollment = await prisma.enrollment.update({
    where: { id: existing.id },
    data: {
      previousScore,
      // The current score is untouched here; only its prediction depends on the
      // snapshot that just moved.
      predictedScore: predictScore(existing.currentScore, previousScore),
    },
    include: { subject: { select: { name: true } }, student: { select: { name: true } } },
  });

  return ok(res, enrollment, "Previous-term score updated");
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
