/**
 * Brings `Enrollment.currentScore` back in line with the marks behind it.
 *
 * The subject score used to have two writers — assessments through
 * `recalcEnrollment`, and Quick Grade Entry writing a number a teacher typed.
 * Marks are the only writer now, but rows written under the old rules are still
 * in the database, and some of them say things the marks do not support:
 *
 *   - a score that contradicts its own marks
 *   - a score with no marks behind it at all
 *
 * Neither is something this script may decide on its own, because both are real
 * numbers that were once shown to a parent. So it reports by default and only
 * writes with `--apply`, the same way `fix-timetable-conflicts.js` does.
 *
 *   node scripts/reconcile-scores.js                    # report only
 *   node scripts/reconcile-scores.js --apply            # rewrite from marks
 *   node scripts/reconcile-scores.js --institute <id>   # one school
 *
 * `--apply` sets every listed enrolment to its marks average, and clears the
 * score of any enrolment with no marks. It never touches `previousScore`, which
 * is last session's carried-forward snapshot and is not derived from anything.
 */

import { PrismaClient } from "@prisma/client";
import { assessmentAverage, letterGrade, predictScore } from "../src/utils/academics.js";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const instituteId = argv[argv.indexOf("--institute") + 1];
const scoped = argv.includes("--institute") && instituteId && !instituteId.startsWith("--");

const pad = (s, n) => String(s ?? "—").padEnd(n);
const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);

async function main() {
  const enrollments = await prisma.enrollment.findMany({
    where: scoped ? { student: { instituteId } } : {},
    include: {
      assessments: { select: { obtained: true, total: true } },
      student: { select: { name: true, grade: true, section: true, institute: { select: { name: true } } } },
      subject: { select: { name: true } },
    },
  });

  const drifted = [];
  const unsupported = [];

  for (const e of enrollments) {
    const marks = assessmentAverage(e.assessments);

    if (marks === null) {
      // A recorded score with nothing at all behind it.
      if (e.currentScore !== null) unsupported.push({ e, marks });
      continue;
    }
    // A tenth of a percent is rounding, not a disagreement.
    if (e.currentScore === null || Math.abs(e.currentScore - marks) > 0.1) {
      drifted.push({ e, marks });
    }
  }

  const total = enrollments.length;
  console.log(`\n  Enrolments examined: ${total}${scoped ? ` (institute ${instituteId})` : ""}`);
  console.log(`  Disagreeing with their marks: ${drifted.length}`);
  console.log(`  Scored with no marks at all:  ${unsupported.length}\n`);

  const table = (rows, heading, after) => {
    if (!rows.length) return;
    console.log(`  ${heading}`);
    console.log(`  ${"".padEnd(84, "─")}`);
    console.log(`  ${pad("STUDENT", 22)}${pad("CLASS", 12)}${pad("SUBJECT", 18)}${pad("RECORDED", 11)}${after}`);
    for (const { e, marks } of rows) {
      console.log(
        `  ${pad(e.student.name, 22)}${pad(`${e.student.grade} ${e.student.section}`, 12)}` +
          `${pad(e.subject.name, 18)}${pad(pct(e.currentScore), 11)}${pct(marks)}`
      );
    }
    console.log("");
  };

  table(drifted, "Recorded score vs. the marks underneath", "FROM MARKS");
  table(unsupported, "Recorded score with nothing behind it", "WOULD BECOME");

  if (!drifted.length && !unsupported.length) {
    console.log("  Every score already matches its marks. Nothing to do.\n");
    return;
  }

  if (!APPLY) {
    console.log("  Report only — nothing was written.");
    console.log("  Re-run with --apply to set these from their marks.\n");
    return;
  }

  let written = 0;
  for (const { e, marks } of [...drifted, ...unsupported]) {
    await prisma.enrollment.update({
      where: { id: e.id },
      data: {
        currentScore: marks,
        letterGrade: letterGrade(marks),
        predictedScore: predictScore(marks, e.previousScore),
      },
    });
    written += 1;
  }

  console.log(`  ${written} enrolment(s) rewritten from their marks.`);
  console.log("  Run `npm run db:verify` to record the new fingerprint.\n");
}

main()
  .catch((err) => {
    console.error("\n  reconcile-scores failed:", err.message, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
