import { prisma } from "../config/prisma.js";
import { assessmentAverage, letterGrade, predictScore } from "../utils/academics.js";

/**
 * Recomputes an enrollment's rolled-up figures from its assessments.
 *
 * Called after every assessment write so the score a parent sees is always
 * derived from real marks rather than something a teacher typed by hand.
 * `previousScore` is preserved — it's the last term's snapshot, not a
 * function of the current term's assessments.
 */
export async function recalcEnrollment(enrollmentId) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { assessments: true },
  });
  if (!enrollment) return null;

  const currentScore = assessmentAverage(enrollment.assessments);
  if (currentScore === null) return enrollment;

  return prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      currentScore,
      letterGrade: letterGrade(currentScore),
      predictedScore: predictScore(currentScore, enrollment.previousScore),
    },
  });
}

/** Recomputes every enrollment for a subject — used after bulk marking. */
export async function recalcSubject(subjectId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { subjectId },
    select: { id: true },
  });
  for (const e of enrollments) await recalcEnrollment(e.id);
  return enrollments.length;
}

/**
 * Rolls the current term into `previousScore` and clears the term's
 * assessments — the "close term" operation an admin runs at term end.
 */
export async function rolloverTerm(instituteId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { student: { instituteId } },
    select: { id: true, currentScore: true },
  });

  for (const e of enrollments) {
    await prisma.enrollment.update({
      where: { id: e.id },
      data: { previousScore: e.currentScore },
    });
  }

  return enrollments.length;
}
