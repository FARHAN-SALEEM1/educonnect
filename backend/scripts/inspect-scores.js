/**
 * Read-only inspection of every enrolment score and what clearing one would do.
 *
 * This writes nothing. It exists because `reconcile-scores.js --apply` would
 * blank eleven scores in this database, and a score that was once printed on a
 * result card and shown to a parent is data, not corruption — the decision to
 * remove it belongs to whoever runs the school, and they need to see what it
 * costs before they make it.
 *
 *   node scripts/inspect-scores.js
 *   node scripts/inspect-scores.js --institute <id>
 *
 * For every enrolment it reports the recorded score, the marks underneath, and
 * the grade; for every student it reports the class average and class rank as
 * they stand now and as they would stand if the unsupported scores were
 * cleared. `averageScore` *excludes* a null rather than counting it as zero, so
 * clearing a low score can raise a student and clearing a high one can lower
 * them — which is exactly why this needs eyes on it.
 */

import { PrismaClient } from "@prisma/client";
import {
  assessmentAverage,
  averageScore,
  classRank,
  letterGrade,
} from "../src/utils/academics.js";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const instituteArg = argv.includes("--institute") ? argv[argv.indexOf("--institute") + 1] : null;

const pad = (v, n) => String(v ?? "—").padEnd(n);
const num = (v) => (v === null || v === undefined ? "—" : `${v}%`);
const rule = (n = 100) => console.log("  " + "".padEnd(n, "─"));

async function main() {
  const enrollments = await prisma.enrollment.findMany({
    where: instituteArg ? { student: { instituteId: instituteArg } } : {},
    include: {
      assessments: {
        select: {
          obtained: true, total: true, type: true, title: true,
          // Terms are rows now, named by the school itself.
          examTerm: { select: { name: true } },
        },
      },
      subject: { select: { id: true, name: true } },
      student: {
        select: {
          id: true, name: true, grade: true, section: true, status: true,
          institute: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ student: { name: "asc" } }, { subject: { name: "asc" } }],
  });

  const rows = enrollments.map((e) => {
    const marks = assessmentAverage(e.assessments);
    const state =
      marks === null
        ? e.currentScore === null ? "empty" : "no-marks"
        : e.currentScore === null || Math.abs(e.currentScore - marks) > 0.1
          ? "disagrees"
          : "agrees";
    return { e, marks, state };
  });

  const counts = rows.reduce((a, r) => ({ ...a, [r.state]: (a[r.state] ?? 0) + 1 }), {});
  console.log(`\n  ENROLMENTS: ${rows.length}`);
  console.log(`    agrees with its marks : ${counts.agrees ?? 0}`);
  console.log(`    disagrees             : ${counts.disagrees ?? 0}`);
  console.log(`    scored, no marks      : ${counts["no-marks"] ?? 0}`);
  console.log(`    no score, no marks    : ${counts.empty ?? 0}\n`);

  // ── 1. every enrolment, in full ────────────────────────────────────────────
  console.log("  ALL ENROLMENTS");
  rule();
  console.log(
    `  ${pad("STUDENT", 15)}${pad("CLASS", 11)}${pad("SUBJECT", 15)}${pad("SCORE", 8)}` +
      `${pad("GRADE", 7)}${pad("MARKS", 8)}${pad("#", 4)}${pad("PREV", 7)}${pad("PRED", 7)}STATE`
  );
  rule();
  for (const { e, marks, state } of rows) {
    console.log(
      `  ${pad(e.student.name, 15)}${pad(`${e.student.grade} ${e.student.section}`, 11)}` +
        `${pad(e.subject.name, 15)}${pad(num(e.currentScore), 8)}${pad(e.letterGrade, 7)}` +
        `${pad(num(marks), 8)}${pad(e.assessments.length, 4)}${pad(num(e.previousScore), 7)}` +
        `${pad(num(e.predictedScore), 7)}${state}`
    );
  }
  console.log("");

  // ── 2. the disagreements, with their marks spelled out ─────────────────────
  const disagreeing = rows.filter((r) => r.state === "disagrees");
  if (disagreeing.length) {
    console.log("  DISAGREES WITH ITS OWN MARKS");
    rule();
    for (const { e, marks } of disagreeing) {
      const terms = [...new Set(e.assessments.map((a) => a.examTerm?.name ?? "no term"))].join(", ");
      const types = [...new Set(e.assessments.map((a) => a.type))].join(", ");
      const detail = e.assessments
        .map((a) => `${a.title} ${a.obtained}/${a.total}${a.examTerm ? ` [${a.examTerm.name}]` : ""}`)
        .join("  ·  ");
      console.log(`  ${e.student.name} — ${e.subject.name} (${e.student.grade} ${e.student.section})`);
      console.log(`     institute      ${e.student.institute.name}`);
      console.log(`     recorded       ${num(e.currentScore)}  grade ${e.letterGrade ?? "—"}`);
      console.log(`     from marks     ${num(marks)}  grade ${letterGrade(marks) ?? "—"}`);
      console.log(`     assessments    ${e.assessments.length}   terms: ${terms}   types: ${types}`);
      console.log(`     marks          ${detail}`);
      console.log(`     enrolment id   ${e.id}`);
      console.log("");
    }
  }

  // ── 3. the unsupported scores, one by one ──────────────────────────────────
  const unsupported = rows.filter((r) => r.state === "no-marks");
  if (unsupported.length) {
    console.log("  SCORED WITH NO MARKS BEHIND IT");
    rule();
    for (const { e } of unsupported) {
      console.log(`  ${e.student.name} — ${e.subject.name} (${e.student.grade} ${e.student.section})`);
      console.log(`     institute      ${e.student.institute.name}  [${e.student.institute.id}]`);
      console.log(`     student status ${e.student.status}`);
      console.log(`     recorded       ${num(e.currentScore)}  grade ${e.letterGrade ?? "—"}`);
      console.log(`     previousScore  ${num(e.previousScore)}   predicted ${num(e.predictedScore)}`);
      console.log(`     assessments    0`);
      console.log(`     enrolment id   ${e.id}`);
      console.log("");
    }
  }

  // ── 4. what clearing the unsupported scores would do to each student ───────
  const affected = [...new Set(unsupported.map((r) => r.e.student.id))];
  if (affected.length) {
    console.log("  IF THE UNSUPPORTED SCORES WERE CLEARED");
    rule();

    // Every classmate, because rank is a position within a class.
    const classesNeeded = [
      ...new Set(
        unsupported.map((r) => `${r.e.student.institute.id}|${r.e.student.grade}|${r.e.student.section}`)
      ),
    ];

    for (const key of classesNeeded) {
      const [instId, grade, section] = key.split("|");
      const cohort = await prisma.student.findMany({
        where: { instituteId: instId, grade, section, status: "ACTIVE" },
        select: {
          id: true, name: true,
          enrollments: { select: { id: true, currentScore: true } },
        },
      });

      const clearedIds = new Set(unsupported.map((r) => r.e.id));

      const before = cohort.map((s) => ({ studentId: s.id, average: averageScore(s.enrollments) }));
      const after = cohort.map((s) => ({
        studentId: s.id,
        average: averageScore(s.enrollments.filter((en) => !clearedIds.has(en.id))),
      }));

      console.log(`  ${grade} ${section}`);
      console.log(
        `  ${pad("STUDENT", 16)}${pad("SUBJECTS", 11)}${pad("AVG NOW", 10)}${pad("AVG AFTER", 11)}` +
          `${pad("RANK NOW", 10)}RANK AFTER`
      );
      for (const s of cohort) {
        const kept = s.enrollments.filter((en) => !clearedIds.has(en.id));
        const lost = s.enrollments.length - kept.length;
        const rankNow = classRank(before, s.id);
        const rankAfter = classRank(after, s.id);
        const mark = lost ? ` (−${lost})` : "";
        console.log(
          `  ${pad(s.name, 16)}${pad(`${s.enrollments.length}${mark}`, 11)}` +
            `${pad(averageScore(s.enrollments), 10)}${pad(averageScore(kept), 11)}` +
            `${pad(`${rankNow.rank}/${rankNow.classSize}`, 10)}${rankAfter.rank}/${rankAfter.classSize}`
        );
      }
      console.log("");
    }
  }

  // ── 5. does the number exist anywhere else? ────────────────────────────────
  console.log("  IS THE SCORE HELD ANYWHERE ELSE?");
  rule();

  const storedReports = [];
  for (const model of ["aiInsight"]) {
    if (prisma[model]) storedReports.push([model, await prisma[model].count()]);
  }

  const insightRefs = await prisma.aiInsight
    .count({ where: { studentId: { in: affected } } })
    .catch(() => 0);

  // Messages and notices are free text — a score could have been quoted into one.
  const scoreStrings = [...new Set(unsupported.map((r) => String(r.e.currentScore)))];
  const quoted = [];
  for (const value of scoreStrings) {
    const inMessages = await prisma.message.count({
      where: { OR: [{ body: { contains: `${value}%` } }, { subject: { contains: `${value}%` } }] },
    });
    const inNotices = await prisma.notice.count({
      where: { OR: [{ body: { contains: `${value}%` } }, { title: { contains: `${value}%` } }] },
    });
    if (inMessages || inNotices) quoted.push({ value, inMessages, inNotices });
  }

  console.log(`  Stored report artefacts : ${storedReports.map(([m, c]) => `${m}=${c}`).join(", ") || "none"}`);
  console.log(`  AI insights for these students : ${insightRefs}`);
  console.log(
    `  Score quoted in a message or notice : ${
      quoted.length ? quoted.map((q) => `${q.value}% (msg ${q.inMessages}, notice ${q.inNotices})`).join("; ") : "none found"
    }`
  );
  console.log(
    `  previousScore also set on these rows : ${
      unsupported.filter((r) => r.e.previousScore !== null).length
    } of ${unsupported.length}`
  );
  console.log("\n  Nothing was written. This script is read-only.\n");
}

main()
  .catch((err) => {
    console.error("\n  inspect-scores failed:", err.message, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
