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
  /**
   * A removed student is out of the school, and out of its reporting.
   *
   * `deletedAt` is spelt out here rather than left to the soft-delete
   * extension, because most of this scope is used as a *nested* filter —
   * `attendance.findMany({ where: { student: scope } })` — and the extension
   * only rewrites the top-level where of a soft-deletable model. Attendance is
   * not one, so nothing added it, and a student who had left kept counting:
   * their absences stayed in the school attendance rate for good, while the
   * student list they had vanished from disagreed with it.
   *
   * At the top level this is simply explicit rather than implicit; the
   * extension hands an explicit `deletedAt` straight through. The recycle bin
   * does not come through here — it asks for deleted rows by name.
   */
  const base = { deletedAt: null };
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

/**
 * A campus the caller's own school actually runs.
 *
 * `branchId` arrives in the body of four write paths, and every one of them
 * spread it straight into Prisma. Prisma only asks whether the branch row
 * exists — not whose it is — so one school could admit a child onto another
 * school's campus. Nobody could *read* the child across the tenant boundary,
 * but the other school's campus card counts its own students with a nested
 * `_count` that no institute filter reaches, so their headcount quietly grew
 * by a pupil they had never enrolled. Closing that campus would then have
 * written to the first school's row.
 *
 * Null clears the assignment and needs no check. Anything else must belong
 * here, and a 400 rather than a 404 because the id came in a body field the
 * caller chose, exactly like `parentId` above it.
 */
export async function assertBranchInInstitute(branchId, instituteId) {
  if (!branchId) return;
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, instituteId, deletedAt: null },
    select: { id: true },
  });
  if (!branch) throw ApiError.badRequest("Selected campus does not belong to this institute");
}
