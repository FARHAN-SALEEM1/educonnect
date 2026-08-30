/**
 * Works out which academic session each existing enrolment belongs to — from
 * evidence, and reports before it writes anything.
 *
 * The tempting version of this was `ALTER TABLE enrollments ADD COLUMN session
 * DEFAULT '2026-27'`. On this database that would have produced the right answer
 * for every row, which is exactly why it was the wrong thing to do: the answer
 * depends on when a school's year opens, and a school running August-to-July has
 * four months of fees and three of attendance sitting in the previous session.
 * A default would have been indistinguishable, afterwards, from a derivation —
 * the evidence would have been written over by the guess.
 *
 * So each row is decided by what is actually under it, in this order:
 *
 *   1. **its own marks.** An assessment carries `takenOn`; the session those
 *      dates fall in is the session the enrolment was taught in. This is the
 *      strongest evidence there is.
 *   2. **when it was created**, if there are no marks.
 *   3. **nothing.** If the marks disagree with each other — spanning two
 *      sessions — or a date falls outside every session the school could have
 *      had, the row is left alone and listed. A flagged row is a question for
 *      somebody who knows the school; it is not a rounding error.
 *
 *   node scripts/backfill-enrollment-sessions.js                  # report only
 *   node scripts/backfill-enrollment-sessions.js --apply          # write it
 *   node scripts/backfill-enrollment-sessions.js --start-month 8  # August school
 *   node scripts/backfill-enrollment-sessions.js --institute <id>
 *
 * `--apply` creates any `AcademicSession` row the evidence calls for and that
 * the school does not have yet, then assigns — all in one transaction, after
 * writing a rollback file naming every enrolment it touched.
 *
 * Before running `--apply` on real data:
 *
 *     npm run db:backup
 *     npm run db:verify            # note the fingerprint
 *     node scripts/backfill-enrollment-sessions.js            # read this
 *     node scripts/backfill-enrollment-sessions.js --apply
 *     npm run db:verify            # row counts must not move
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { defaultSpan, sessionNameForDate } from "../src/services/session.service.js";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const APPLY = argv.includes("--apply");
const RESTORE = flag("restore");
const START_MONTH = Number(flag("start-month") ?? 4);
const ONLY_INSTITUTE = flag("institute");
const BACKUP_DIR = path.resolve("backups");

const pad = (v, n) => String(v ?? "—").padEnd(n);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
const rule = (n = 104) => console.log("  " + "".padEnd(n, "─"));

async function restore(file) {
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`\n  Restoring ${saved.rows.length} enrolment(s) from ${path.basename(file)}\n`);
  await prisma.$transaction(async (tx) => {
    for (const r of saved.rows) {
      const still = await tx.enrollment.findUnique({ where: { id: r.id }, select: { id: true } });
      if (!still) continue;
      await tx.enrollment.update({
        where: { id: r.id },
        data: { academicSessionId: r.before },
      });
    }
  });
  console.log("  Restored. Sessions created by --apply are left in place; they hold no marks.\n");
}

/** What the evidence says, and what stands behind it. */
function decide(enrollment, startMonth) {
  const marks = enrollment.assessments;

  if (marks.length) {
    const names = [...new Set(marks.map((a) => sessionNameForDate(a.takenOn, startMonth)))];
    if (names.length === 1) {
      return { session: names[0], basis: "marks", detail: `${marks.length} mark(s)` };
    }
    // Marks that straddle two sessions cannot pick one for the enrolment.
    return {
      session: null,
      basis: null,
      detail: `marks span ${names.sort().join(" and ")}`,
    };
  }

  const name = sessionNameForDate(enrollment.createdAt, startMonth);
  return name
    ? { session: name, basis: "created", detail: day(enrollment.createdAt) }
    : { session: null, basis: null, detail: "no marks, no usable creation date" };
}

async function main() {
  if (RESTORE) return restore(RESTORE);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      academicSessionId: null,
      ...(ONLY_INSTITUTE && { student: { instituteId: ONLY_INSTITUTE } }),
    },
    include: {
      assessments: { select: { takenOn: true } },
      subject: { select: { name: true } },
      student: {
        select: {
          name: true, grade: true, section: true,
          institute: { select: { id: true, name: true, currentSession: true } },
        },
      },
    },
    orderBy: [{ student: { name: "asc" } }, { subject: { name: "asc" } }],
  });

  const total = await prisma.enrollment.count();
  console.log(`\n  Enrolments without a session: ${enrollments.length} of ${total}`);
  console.log(`  School year opens in month ${START_MONTH} (${START_MONTH === 4 ? "April — the Pakistani norm" : "as given"})\n`);

  if (!enrollments.length) {
    console.log("  Nothing to do.\n");
    return;
  }

  const plan = enrollments.map((e) => ({ e, ...decide(e, START_MONTH) }));

  // ── what the evidence decided ──────────────────────────────────────────────
  console.log("  WHAT THE EVIDENCE SAYS");
  rule();
  console.log(
    `  ${pad("STUDENT", 15)}${pad("CLASS", 11)}${pad("SUBJECT", 15)}${pad("SESSION", 10)}${pad("FROM", 9)}EVIDENCE`
  );
  rule();
  for (const p of plan) {
    console.log(
      `  ${pad(p.e.student.name, 15)}${pad(`${p.e.student.grade} ${p.e.student.section}`, 11)}` +
        `${pad(p.e.subject.name, 15)}${pad(p.session ?? "—", 10)}${pad(p.basis ?? "unresolved", 9)}${p.detail}`
    );
  }
  console.log("");

  const byBasis = plan.reduce((a, p) => ({ ...a, [p.basis ?? "unresolved"]: (a[p.basis ?? "unresolved"] ?? 0) + 1 }), {});
  console.log(`  Decided from marks   : ${byBasis.marks ?? 0}`);
  console.log(`  Decided from created : ${byBasis.created ?? 0}`);
  console.log(`  Left alone, flagged  : ${byBasis.unresolved ?? 0}\n`);

  const flagged = plan.filter((p) => !p.session);
  if (flagged.length) {
    console.log("  THESE ARE NOT GUESSED AT — somebody who knows the school has to say");
    rule();
    for (const p of flagged) {
      console.log(`  ${p.e.student.name} — ${p.e.subject.name}: ${p.detail}`);
      console.log(`     enrolment id ${p.e.id}`);
    }
    console.log("");
  }

  // ── which session rows the evidence calls for ──────────────────────────────
  const wanted = new Map();
  for (const p of plan) {
    if (!p.session) continue;
    const key = `${p.e.student.institute.id}|${p.session}`;
    if (!wanted.has(key)) {
      wanted.set(key, {
        instituteId: p.e.student.institute.id,
        instituteName: p.e.student.institute.name,
        name: p.session,
        count: 0,
      });
    }
    wanted.get(key).count += 1;
  }

  const existing = await prisma.academicSession.findMany({
    where: { instituteId: { in: [...new Set([...wanted.values()].map((w) => w.instituteId))] } },
    select: { id: true, instituteId: true, name: true },
  });
  const haveKey = new Set(existing.map((s) => `${s.instituteId}|${s.name}`));

  console.log("  SESSIONS THE EVIDENCE CALLS FOR");
  rule();
  console.log(`  ${pad("SCHOOL", 28)}${pad("SESSION", 10)}${pad("ENROLMENTS", 12)}${pad("SPAN", 26)}STATUS`);
  rule();
  for (const w of wanted.values()) {
    const span = defaultSpan(w.name, START_MONTH);
    const key = `${w.instituteId}|${w.name}`;
    console.log(
      `  ${pad(w.instituteName, 28)}${pad(w.name, 10)}${pad(w.count, 12)}` +
        `${pad(`${day(span.startsOn)} → ${day(span.endsOn)}`, 26)}` +
        (haveKey.has(key) ? "exists" : "would be created")
    );
  }
  console.log("");

  if (!APPLY) {
    console.log("  Report only — nothing was written.");
    console.log("  Re-run with --apply to create the sessions above and assign them.\n");
    return;
  }

  // ── rollback file first ────────────────────────────────────────────────────
  const assignable = plan.filter((p) => p.session);
  if (!assignable.length) {
    console.log("  Nothing the evidence could decide. Nothing written.\n");
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollbackPath = path.join(BACKUP_DIR, `enrollment-sessions-${stamp}.json`);
  fs.writeFileSync(
    rollbackPath,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        startMonth: START_MONTH,
        rows: assignable.map((p) => ({
          id: p.e.id,
          student: p.e.student.name,
          subject: p.e.subject.name,
          before: p.e.academicSessionId,
          session: p.session,
          basis: p.basis,
        })),
      },
      null,
      2
    )
  );
  console.log(`  Rollback written: ${rollbackPath}`);

  await prisma.$transaction(async (tx) => {
    /**
     * Any session the evidence named that the school has no row for.
     *
     * A created row is marked current only when its name is the one the school
     * already says it is running *and* no row claims that yet. That is not this
     * script moving the present — the institute has been carrying that name all
     * along, and leaving the row unflagged would put the two out of step.
     * Everything else is a past year and stays unflagged.
     */
    const idByKey = new Map(existing.map((s) => [`${s.instituteId}|${s.name}`, s.id]));
    for (const w of wanted.values()) {
      const key = `${w.instituteId}|${w.name}`;
      if (idByKey.has(key)) continue;

      const [institute, alreadyCurrent] = await Promise.all([
        tx.institute.findUnique({ where: { id: w.instituteId }, select: { currentSession: true } }),
        tx.academicSession.findFirst({
          where: { instituteId: w.instituteId, isCurrent: true },
          select: { id: true },
        }),
      ]);

      const span = defaultSpan(w.name, START_MONTH);
      const created = await tx.academicSession.create({
        data: {
          instituteId: w.instituteId,
          name: w.name,
          ...span,
          isCurrent: !alreadyCurrent && institute?.currentSession === w.name,
        },
      });
      idByKey.set(key, created.id);
    }

    for (const p of assignable) {
      await tx.enrollment.update({
        where: { id: p.e.id },
        data: { academicSessionId: idByKey.get(`${p.e.student.institute.id}|${p.session}`) },
      });
    }
  });

  console.log(`  ${assignable.length} enrolment(s) assigned in one transaction.`);
  if (flagged.length) console.log(`  ${flagged.length} left alone and listed above.`);
  console.log("\n  To undo exactly this change:");
  console.log(`    node scripts/backfill-enrollment-sessions.js --restore ${rollbackPath}\n`);
  console.log("  Run `npm run db:verify` to record the new fingerprint.\n");
}

main()
  .catch((err) => {
    console.error("\n  backfill-enrollment-sessions failed:", err.message, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
