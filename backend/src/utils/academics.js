/**
 * Shared academic maths: percentage → letter grade → grade point,
 * GPA, attendance rates, and the next-term score prediction.
 * Keeping it in one place means the teacher portal, parent portal and
 * report exports can never disagree about a student's grade.
 */
import { gradingFor } from "./grading.js";

/**
 * The platform's own scale, for callers with no school in hand.
 *
 * There used to be a second band table here, and it was the one nearly the
 * whole product actually used — the student list, both dashboards, the
 * gradebook and the stored letter on an enrolment all read it, while only the
 * result card read the school's own. A school that set A+ at 80 therefore saw
 * A+ on the card and A− everywhere else in the app.
 *
 * There is one band table now, in utils/grading.js, and these three are the
 * unconfigured fallback rather than a rival opinion. Anything that knows which
 * school it is answering about should use gradingFor(institute) or
 * policyFor(instituteId) instead of these.
 */
const platform = gradingFor(null);

export const letterGrade = (score) => platform.letterGrade(score);
export const gradePoint = (score) => platform.gradePoint(score);

/** Unweighted GPA on the platform default scale. */
export const calculateGpa = (enrollments = []) => platform.gpa(enrollments);

export const averageScore = (enrollments = []) => {
  const scored = enrollments.filter((e) => e.currentScore !== null && e.currentScore !== undefined);
  if (!scored.length) return 0;
  return Number((scored.reduce((s, e) => s + e.currentScore, 0) / scored.length).toFixed(1));
};

/**
 * Next-term prediction: current score plus the term-over-term trend,
 * damped to 60% so one good term doesn't over-promise, then clamped 0-100.
 */
export const predictScore = (current, previous) => {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return Math.round(current);
  const trend = (current - previous) * 0.6;
  return Math.max(0, Math.min(100, Math.round(current + trend)));
};

/** Percentage of a subject's assessments, used to derive the current score. */
/**
 * The marks themselves: what was obtained, out of what.
 *
 * A Pakistani result card is written in marks — "82 / 100" per subject and
 * "850 / 1100" at the foot — with the percentage as a summary of them, not a
 * replacement for them. This was computed inside `assessmentAverage` and thrown
 * away, so the card could only ever show the percentage and a parent had no way
 * to check the arithmetic.
 */
export const marksTotal = (assessments = []) =>
  assessments.reduce(
    (acc, a) => ({ obtained: acc.obtained + a.obtained, total: acc.total + a.total }),
    { obtained: 0, total: 0 }
  );

export const assessmentAverage = (assessments = []) => {
  if (!assessments.length) return null;
  const totals = marksTotal(assessments);
  if (!totals.total) return null;
  return Number(((totals.obtained / totals.total) * 100).toFixed(1));
};

/**
 * The counts + rate the dashboards show, from statuses already tallied.
 *
 * Kept separate from `attendanceSummary` so the database can do the counting.
 * Reading every row to tally it in JavaScript is fine for one child and not
 * for a school: at 1,200 students and a term of registers the summary endpoint
 * was pulling 72,000 rows into memory and taking ten seconds. The rule for what
 * counts as attendance lives here, once, whichever way the counting happened.
 */
export const summaryFromCounts = (counts = {}) => {
  const present = counts.PRESENT ?? 0;
  const absent = counts.ABSENT ?? 0;
  const late = counts.LATE ?? 0;
  const leave = counts.LEAVE ?? 0;
  const total = present + absent + late + leave;
  // A late arrival still counts as attendance for the headline rate.
  const attended = present + late;
  return {
    present,
    absent,
    late,
    leave,
    total,
    rate: total ? Number(((attended / total) * 100).toFixed(1)) : 0,
  };
};

/** Turns raw attendance rows into the counts + rate the dashboards show. */
export const attendanceSummary = (records = []) => {
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
  for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;
  return summaryFromCounts(counts);
};

/** Ranks a student within their class by average score. Returns { rank, classSize }. */
export const classRank = (studentAverages, studentId) => {
  const sorted = [...studentAverages].sort((a, b) => b.average - a.average);
  const index = sorted.findIndex((s) => s.studentId === studentId);
  return {
    rank: index === -1 ? null : index + 1,
    classSize: sorted.length,
  };
};

/** "2026-03" for a given date — the period key used by fee invoices. */
export const periodKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** "2026-03" → "Mar 2026" */
export const periodLabel = (period) => {
  const [year, month] = period.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[month - 1]} ${year}`;
};
