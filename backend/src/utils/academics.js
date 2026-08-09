/**
 * Shared academic maths: percentage → letter grade → grade point,
 * GPA, attendance rates, and the next-term score prediction.
 * Keeping it in one place means the teacher portal, parent portal and
 * report exports can never disagree about a student's grade.
 */

const GRADE_BANDS = [
  { min: 90, letter: "A+", point: 4.0 },
  { min: 85, letter: "A", point: 4.0 },
  { min: 80, letter: "A−", point: 3.7 },
  { min: 75, letter: "B+", point: 3.3 },
  { min: 70, letter: "B", point: 3.0 },
  { min: 65, letter: "B−", point: 2.7 },
  { min: 60, letter: "C+", point: 2.3 },
  { min: 55, letter: "C", point: 2.0 },
  { min: 50, letter: "D", point: 1.0 },
  { min: 0, letter: "F", point: 0.0 },
];

export const letterGrade = (score) => {
  if (score === null || score === undefined) return null;
  return GRADE_BANDS.find((b) => score >= b.min).letter;
};

export const gradePoint = (score) => {
  if (score === null || score === undefined) return 0;
  return GRADE_BANDS.find((b) => score >= b.min).point;
};

/** Unweighted GPA on a 4.0 scale across a student's enrollments. */
export const calculateGpa = (enrollments = []) => {
  const scored = enrollments.filter((e) => e.currentScore !== null && e.currentScore !== undefined);
  if (!scored.length) return 0;
  const total = scored.reduce((sum, e) => sum + gradePoint(e.currentScore), 0);
  return Number((total / scored.length).toFixed(2));
};

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
export const assessmentAverage = (assessments = []) => {
  if (!assessments.length) return null;
  const totals = assessments.reduce(
    (acc, a) => ({ obtained: acc.obtained + a.obtained, total: acc.total + a.total }),
    { obtained: 0, total: 0 }
  );
  if (!totals.total) return null;
  return Number(((totals.obtained / totals.total) * 100).toFixed(1));
};

/** Turns raw attendance rows into the counts + rate the dashboards show. */
export const attendanceSummary = (records = []) => {
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
  for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;
  const total = records.length;
  // A late arrival still counts as attendance for the headline rate.
  const attended = counts.PRESENT + counts.LATE;
  return {
    present: counts.PRESENT,
    absent: counts.ABSENT,
    late: counts.LATE,
    leave: counts.LEAVE,
    total,
    rate: total ? Number(((attended / total) * 100).toFixed(1)) : 0,
  };
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
