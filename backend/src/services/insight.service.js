import { prisma } from "../config/prisma.js";
import { attendanceSummary, predictScore } from "../utils/academics.js";

/**
 * Rule-based insight engine behind the parent portal's "AI Insights" tab.
 *
 * It reads a student's real performance and attendance history and emits
 * plain-language recommendations. Deliberately deterministic — the same
 * data always produces the same advice, which makes it explainable in a
 * viva and testable, unlike an opaque model call.
 *
 * Rules:
 *  1. Declining subject      — score dropped ≥ 5 points term-over-term
 *  2. Weak subject           — score below 60
 *  3. Consecutive poor marks — last 3 assessments all under 60%
 *  4. Strong subject         — score ≥ 90
 *  5. Improving subject      — score rose ≥ 5 points
 *  6. Attendance risk        — attendance rate below 85%
 */

const SEVERITY = { INFO: 1, WATCH: 2, ACTION: 3 };

export async function generateInsightsForStudent(studentId) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        include: {
          subject: true,
          assessments: { orderBy: { takenOn: "desc" }, take: 5 },
        },
      },
      attendance: { orderBy: { date: "desc" }, take: 60 },
    },
  });

  if (!student) return [];

  const insights = [];

  for (const enrollment of student.enrollments) {
    const { subject, currentScore, previousScore, assessments } = enrollment;
    if (currentScore === null || currentScore === undefined) continue;

    const delta =
      previousScore === null || previousScore === undefined ? 0 : currentScore - previousScore;

    // Rule 1 — declining performance
    if (delta <= -5) {
      insights.push({
        studentId,
        subjectId: subject.id,
        type: "WEAKNESS",
        severity: SEVERITY.ACTION,
        message: `${subject.name} dropped ${Math.abs(Math.round(delta))} points since last term (${Math.round(previousScore)}% → ${Math.round(currentScore)}%). Schedule focused revision and speak to the subject teacher.`,
      });
    }

    // Rule 2 — weak subject
    if (currentScore < 60) {
      insights.push({
        studentId,
        subjectId: subject.id,
        type: "WEAKNESS",
        severity: SEVERITY.ACTION,
        message: `${subject.name} is at ${Math.round(currentScore)}%, below the 60% pass benchmark. Extra coaching is strongly recommended.`,
      });
    }

    // Rule 3 — three consecutive poor assessments
    const recent = assessments.slice(0, 3);
    if (recent.length === 3 && recent.every((a) => a.total > 0 && (a.obtained / a.total) * 100 < 60)) {
      insights.push({
        studentId,
        subjectId: subject.id,
        type: "WEAKNESS",
        severity: SEVERITY.WATCH,
        message: `The last 3 ${subject.name} assessments were all under 60%. This looks like a topic gap rather than a one-off — review the recent syllabus with the teacher.`,
      });
    }

    // Rule 4 — standout subject
    if (currentScore >= 90) {
      insights.push({
        studentId,
        subjectId: subject.id,
        type: "STRENGTH",
        severity: SEVERITY.INFO,
        message: `Excellent work in ${subject.name} (${Math.round(currentScore)}%). Consider advanced problem sets or a subject olympiad to keep the momentum.`,
      });
    }

    // Rule 5 — improvement worth reinforcing
    if (delta >= 5) {
      insights.push({
        studentId,
        subjectId: subject.id,
        type: "STRENGTH",
        severity: SEVERITY.INFO,
        message: `${subject.name} improved by ${Math.round(delta)} points this term. Whatever changed in the study routine is working — keep it up.`,
      });
    }

    // Prediction for every scored subject
    const predicted = predictScore(currentScore, previousScore);
    if (predicted !== null) {
      insights.push({
        studentId,
        subjectId: subject.id,
        type: "PREDICTION",
        severity: SEVERITY.INFO,
        message: `Projected next-term score in ${subject.name}: ${predicted}%, based on the current trend.`,
      });
    }
  }

  // Rule 6 — attendance
  const attendance = attendanceSummary(student.attendance);
  if (attendance.total >= 5 && attendance.rate < 85) {
    insights.push({
      studentId,
      subjectId: null,
      type: "ATTENDANCE",
      severity: attendance.rate < 75 ? SEVERITY.ACTION : SEVERITY.WATCH,
      message: `Attendance is ${attendance.rate}% over the last ${attendance.total} school days (${attendance.absent} absences). Below 85% usually shows up in exam results within a term.`,
    });
  }

  // Replace the previous generation so insights never go stale.
  await prisma.$transaction([
    prisma.aiInsight.deleteMany({ where: { studentId } }),
    ...(insights.length ? [prisma.aiInsight.createMany({ data: insights })] : []),
  ]);

  return prisma.aiInsight.findMany({
    where: { studentId },
    include: { subject: { select: { id: true, name: true, color: true } } },
    orderBy: [{ severity: "desc" }, { generatedAt: "desc" }],
  });
}

/** Regenerates insights for every active student in an institute. */
export async function generateInsightsForInstitute(instituteId) {
  const students = await prisma.student.findMany({
    where: { instituteId, status: "ACTIVE" },
    select: { id: true },
  });

  let count = 0;
  for (const student of students) {
    await generateInsightsForStudent(student.id);
    count += 1;
  }
  return count;
}
