import { prisma } from "../config/prisma.js";
import { assessmentAverage, predictScore } from "../utils/academics.js";
import { gradingFor } from "../utils/grading.js";
import { listTerms, weightedAverage, weightingIsComplete } from "./term.service.js";

/**
 * One school's grading policy, loaded by id.
 *
 * Every letter this product writes down should come from the school that
 * awarded it. Before this existed the only way to grade was the platform
 * default, so a school could set its own bands under Settings and watch
 * nothing outside the result card obey them.
 *
 * A school that has set nothing gets the defaults, which is what
 * gradingFor already does with a null.
 */
export async function policyFor(instituteId) {
  if (!instituteId) return gradingFor(null);
  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: { gradingSettings: true },
  });
  return gradingFor(institute);
}

/**
 * Recomputes an enrollment's rolled-up figures from its assessments.
 *
 * `currentScore` is a derived cache, not a field anyone writes. Marks are the
 * only thing that sets it, so a result card can always be defended by pointing
 * at the marks behind it — which is what a Pakistani parent asks for when the
 * number is not what they expected.
 *
 * `previousScore` is preserved: it's the last term's snapshot, not a function
 * of this term's assessments.
 */
export async function recalcEnrollment(enrollmentId) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      assessments: true,
      // Whose scale this letter is written on — the school's, not the platform's.
      student: { select: { instituteId: true } },
    },
  });
  if (!enrollment) return null;

  const grading = await policyFor(enrollment.student?.instituteId);

  /**
   * The year's terms, and whether the school weights them.
   *
   * `currentScore` is the figure the whole product reads for "how is this
   * child doing in this subject" — the student list, both dashboards, the
   * gradebook, the class position. If it pools the marks while the result
   * card weights them, the two disagree: the card says first in class at
   * 81.2% and the list says second at 79.5%, which is the same document
   * arguing with itself one screen apart.
   *
   * So the roll-up is weighted here too, once and at write time, rather than
   * every reader having to know about terms.
   */
  const terms = enrollment.academicSessionId
    ? await listTerms(enrollment.academicSessionId)
    : [];
  const weighted = weightingIsComplete(terms);

  /**
   * No marks means no score — the cache is cleared rather than left standing.
   *
   * This used to return early when the average came back null, so deleting the
   * last assessment left whatever number was there before. Combined with the
   * hand-typed scores this function now replaces, that meant a subject could
   * report a grade with nothing whatsoever behind it.
   */
  const currentScore = weighted
    ? weightedAverage(enrollment.assessments, terms).score
    : assessmentAverage(enrollment.assessments);

  return prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      currentScore,
      letterGrade: grading.letterGrade(currentScore),
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
