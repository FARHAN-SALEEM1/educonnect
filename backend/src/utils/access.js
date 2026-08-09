import { prisma } from "../config/prisma.js";
import { ApiError } from "./ApiError.js";

/**
 * Row-level visibility rules on top of tenant scoping.
 *
 * ADMIN / SUPERADMIN — every student in scope
 * TEACHER           — only students enrolled in a subject they teach
 * PARENT            — only their own children
 */
export async function studentScopeWhere(req) {
  const base = {};
  if (req.instituteId) base.instituteId = req.instituteId;

  switch (req.user.role) {
    case "SUPERADMIN":
    case "ADMIN":
      return base;

    case "TEACHER": {
      if (!req.user.teacherId) throw ApiError.forbidden("No teacher profile linked to your account");
      return {
        ...base,
        enrollments: { some: { subject: { teacherId: req.user.teacherId } } },
      };
    }

    case "PARENT": {
      if (!req.user.parentId) throw ApiError.forbidden("No parent profile linked to your account");
      return { ...base, parentId: req.user.parentId };
    }

    default:
      throw ApiError.forbidden();
  }
}

/**
 * Loads a student the caller is actually allowed to see, or throws 404.
 * Returning 404 (not 403) avoids leaking whether the id exists elsewhere.
 */
export async function findAccessibleStudent(req, studentId, include = undefined) {
  const where = await studentScopeWhere(req);
  const student = await prisma.student.findFirst({
    where: { ...where, id: studentId },
    ...(include && { include }),
  });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

/** Confirms a subject belongs to the caller's institute (and to them, if a teacher). */
export async function findAccessibleSubject(req, subjectId) {
  const where = { id: subjectId };
  if (req.instituteId) where.instituteId = req.instituteId;
  if (req.user.role === "TEACHER") where.teacherId = req.user.teacherId;

  const subject = await prisma.subject.findFirst({ where });
  if (!subject) throw ApiError.notFound("Subject not found or not assigned to you");
  return subject;
}
