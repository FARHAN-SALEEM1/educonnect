/**
 * Applies a decision about specific enrolment scores — and can undo it.
 *
 * This is deliberately not `reconcile-scores.js --apply`. That one selects rows
 * by a condition, and a condition is the wrong instrument here: the scores in
 * question are a school's carried-forward records, and which of them should go
 * is a judgement someone makes row by row, not a query anyone should trust to
 * make for them. So this refuses to run without an explicit list of enrolment
 * ids, and it writes a rollback file before it changes anything.
 *
 *   # see what would happen — this is the default, nothing is written
 *   node scripts/apply-score-decision.js --ids cmx1,cmx2
 *   node scripts/apply-score-decision.js --file decision.txt
 *
 *   # actually do it
 *   node scripts/apply-score-decision.js --ids cmx1,cmx2 --apply
 *
 *   # put it back exactly as it was
 *   node scripts/apply-score-decision.js --restore backups/scores-<stamp>.json
 *
 * What `--apply` does to each named enrolment: sets `currentScore` to its marks
 * average — which is `null` when there are no marks — and recomputes
 * `letterGrade` and `predictedScore` from it. `previousScore` is never touched:
 * it is last session's snapshot and is not derived from this term's marks.
 *
 * Before running `--apply` on production data, take a database backup as well:
 *
 *     npm run db:backup
 *     npm run db:verify        # note the fingerprint
 *     node scripts/apply-score-decision.js --ids … --apply
 *     npm run db:verify        # fingerprint changes; row counts must not
 *
 * The rollback file this writes restores the exact prior values of the rows it
 * touched. The database backup covers everything else.
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assessmentAverage, letterGrade, predictScore } from "../src/utils/academics.js";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const APPLY = argv.includes("--apply");
const RESTORE = flag("restore");
const BACKUP_DIR = path.resolve("backups");

const pad = (v, n) => String(v ?? "—").padEnd(n);
const num = (v) => (v === null || v === undefined ? "null" : `${v}%`);

/** Puts back exactly what was there, row by row. */
async function restore(file) {
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`\n  Restoring ${saved.rows.length} enrolment(s) from ${path.basename(file)}`);
  console.log(`  (taken ${saved.takenAt})\n`);

  const missing = [];
  await prisma.$transaction(async (tx) => {
    for (const r of saved.rows) {
      const still = await tx.enrollment.findUnique({ where: { id: r.id }, select: { id: true } });
      if (!still) {
        missing.push(r.id);
        continue;
      }
      await tx.enrollment.update({
        where: { id: r.id },
        data: {
          currentScore: r.before.currentScore,
          letterGrade: r.before.letterGrade,
          predictedScore: r.before.predictedScore,
        },
      });
      console.log(`  ${pad(r.student, 16)}${pad(r.subject, 15)}→ ${num(r.before.currentScore)}`);
    }
  });

  if (missing.length) {
    console.log(`\n  ${missing.length} enrolment(s) no longer exist and were skipped:`);
    missing.forEach((id) => console.log(`    ${id}`));
  }
  console.log("\n  Restored. Run `npm run db:verify` to confirm the fingerprint.\n");
}

async function main() {
  if (RESTORE) return restore(RESTORE);

  const ids = (flag("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .concat(
      flag("file")
        ? fs.readFileSync(flag("file"), "utf8").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
        : []
    );

  if (!ids.length) {
    console.error(
      "\n  No enrolment ids given.\n\n" +
        "  This script will not select rows by a condition — that is what\n" +
        "  `scripts/inspect-scores.js` is for. Read that report, decide which\n" +
        "  enrolments should change, and pass their ids explicitly:\n\n" +
        "    node scripts/apply-score-decision.js --ids <id>,<id> [--apply]\n"
    );
    process.exitCode = 1;
    return;
  }

  const rows = await prisma.enrollment.findMany({
    where: { id: { in: ids } },
    include: {
      assessments: { select: { obtained: true, total: true } },
      subject: { select: { name: true } },
      student: { select: { name: true, grade: true, section: true, institute: { select: { name: true } } } },
    },
  });

  const found = new Set(rows.map((r) => r.id));
  const unknown = ids.filter((id) => !found.has(id));
  if (unknown.length) {
    console.log(`\n  ${unknown.length} id(s) matched no enrolment and will be ignored:`);
    unknown.forEach((id) => console.log(`    ${id}`));
  }
  if (!rows.length) {
    console.log("\n  Nothing to do.\n");
    return;
  }

  const plan = rows.map((e) => {
    const marks = assessmentAverage(e.assessments);
    return {
      id: e.id,
      student: e.student.name,
      subject: e.subject.name,
      institute: e.student.institute.name,
      className: `${e.student.grade} ${e.student.section}`,
      marks,
      before: {
        currentScore: e.currentScore,
        letterGrade: e.letterGrade,
        predictedScore: e.predictedScore,
      },
      after: {
        currentScore: marks,
        letterGrade: letterGrade(marks),
        predictedScore: predictScore(marks, e.previousScore),
      },
    };
  });

  console.log(`\n  ${APPLY ? "APPLYING" : "DRY RUN"} — ${plan.length} enrolment(s)\n`);
  console.log(
    `  ${pad("STUDENT", 16)}${pad("CLASS", 11)}${pad("SUBJECT", 15)}` +
      `${pad("SCORE", 20)}${pad("GRADE", 14)}MARKS`
  );
  console.log("  " + "".padEnd(96, "─"));
  for (const p of plan) {
    const changes = p.before.currentScore !== p.after.currentScore;
    console.log(
      `  ${pad(p.student, 16)}${pad(p.className, 11)}${pad(p.subject, 15)}` +
        `${pad(`${num(p.before.currentScore)} → ${num(p.after.currentScore)}`, 20)}` +
        `${pad(`${p.before.letterGrade ?? "—"} → ${p.after.letterGrade ?? "—"}`, 14)}` +
        `${p.marks === null ? "none" : num(p.marks)}${changes ? "" : "   (no change)"}`
    );
  }
  console.log("");

  const changing = plan.filter((p) => p.before.currentScore !== p.after.currentScore);
  const clearing = changing.filter((p) => p.after.currentScore === null);
  if (clearing.length) {
    console.log(`  ${clearing.length} of these would be CLEARED — no marks stand behind them.`);
    console.log("  Those subjects will show no score on the result card, and will drop");
    console.log("  out of the class average rather than counting as zero.\n");
  }

  if (!APPLY) {
    console.log("  Dry run — nothing was written.");
    console.log("  Re-run with --apply to make these changes.\n");
    return;
  }

  // ── rollback file, written before anything changes ──────────────────────────
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackPath = path.join(BACKUP_DIR, `scores-${stamp}.json`);
  fs.writeFileSync(
    rollbackPath,
    JSON.stringify({ takenAt: new Date().toISOString(), rows: plan }, null, 2)
  );
  console.log(`  Rollback written: ${rollbackPath}`);

  // ── one transaction, so this is all-or-nothing ─────────────────────────────
  await prisma.$transaction(async (tx) => {
    for (const p of changing) {
      await tx.enrollment.update({
        where: { id: p.id },
        data: {
          currentScore: p.after.currentScore,
          letterGrade: p.after.letterGrade,
          predictedScore: p.after.predictedScore,
        },
      });
    }
  });

  console.log(`  ${changing.length} enrolment(s) updated in one transaction.\n`);
  console.log("  To undo exactly this change:");
  console.log(`    node scripts/apply-score-decision.js --restore ${rollbackPath}\n`);
  console.log("  Run `npm run db:verify` to record the new fingerprint.\n");
}

main()
  .catch((err) => {
    console.error("\n  apply-score-decision failed:", err.message, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
