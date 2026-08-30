import "dotenv/config";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Clears the teacher conflicts the seeded timetable shipped with.
 *
 * Four teachers cover both classes. Hassan (Maths) and Fatima (Chemistry) were
 * staggered across periods so they never clash; Ali (English) and Tariq (Urdu)
 * were left on the same periods as Grade 8-A on nine occasions, so each was
 * booked into two rooms at once.
 *
 * Both classes have all six periods filled Monday–Friday, so nothing can be
 * moved into a gap — there are none. The fix is a swap, and because 9-B's
 * English and Urdu sit exactly where 8-A uses those subjects, swapping those
 * two with each other clears both of that day's conflicts at once. Five swaps,
 * ten rows, no row created or deleted.
 *
 * Only `period`, `startTime` and `endTime` move. Subject, teacher, room, class
 * and day stay exactly as they were, so each class keeps the same subjects and
 * the same number of periods.
 *
 *   node scripts/fix-timetable-conflicts.js            # report only
 *   node scripts/fix-timetable-conflicts.js --apply    # write
 *
 * Safe to run twice. The swap plan below is fixed — it always pairs 9-B's
 * English with its Urdu — so running --apply on an already-clean timetable
 * used to swap them straight back and re-create all nine conflicts. Two things
 * stop that now: nothing is written when the sweep finds no conflicts, and the
 * plan is simulated before it is committed, so it is only ever applied when it
 * demonstrably reduces the count.
 */

const APPLY = process.argv.includes("--apply");
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** A period number no real slot uses, to park a row mid-swap. */
const TEMP_PERIOD = 99;

const minutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

/** Every teacher/class/room clash in a set of slots. */
function sweep(slots) {
  const out = { teacher: [], class: [], room: [] };
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i];
      const b = slots[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      const a1 = minutes(a.startTime);
      const b1 = minutes(b.startTime);
      if (a1 === null || b1 === null) {
        if (a.period !== b.period) continue;
      } else if (!overlaps(a1, minutes(a.endTime), b1, minutes(b.endTime))) continue;

      const sameClass = a.grade === b.grade && a.section === b.section;
      if (a.teacherId && a.teacherId === b.teacherId) out.teacher.push([a, b]);
      if (sameClass) out.class.push([a, b]);
      // Two periods of the same class in one room is the normal case, not a clash.
      if (!sameClass && a.room && b.room && a.room.toLowerCase() === b.room.toLowerCase()) {
        out.room.push([a, b]);
      }
    }
  }
  return out;
}

const report = (label, s) =>
  console.log(
    `  ${label.padEnd(8)} teacher=${s.teacher.length}  class=${s.class.length}  room=${s.room.length}`
  );

const total = (s) => s.teacher.length + s.class.length + s.room.length;

/**
 * The plan applied to a copy, so its effect can be checked before anything is
 * written. `sweep` only reads day, period, times, teacher, class and room, so
 * shallow clones carrying those are enough to score the outcome exactly.
 */
const simulate = (slots, pairs) => {
  const byId = new Map(slots.map((s) => [s.id, { ...s }]));
  for (const { english, urdu } of pairs) {
    const e = byId.get(english.id);
    const u = byId.get(urdu.id);
    if (!e || !u) continue;
    [e.period, u.period] = [u.period, e.period];
    [e.startTime, u.startTime] = [u.startTime, e.startTime];
    [e.endTime, u.endTime] = [u.endTime, e.endTime];
  }
  return [...byId.values()];
};

const main = async () => {
  const before = await prismaRaw.timetableSlot.findMany({
    include: { subject: { select: { name: true } }, teacher: { select: { name: true } } },
  });

  console.log(`\n  Timetable slots: ${before.length}\n`);
  console.log("=== CONFLICTS ===");
  const beforeSweep = sweep(before);
  report("before", beforeSweep);

  /**
   * Nothing to fix means nothing to do — including on a dry run, which used to
   * print five swaps at a timetable that had none of the problems they solve.
   */
  if (total(beforeSweep) === 0) {
    console.log("\n  No conflicts. Nothing to do — the timetable is already clean.\n");
    await prismaRaw.$disconnect();
    return;
  }

  // The pairs to exchange: Grade 9-B's English and Urdu, per day.
  const pairs = [];
  for (let d = 1; d <= 5; d += 1) {
    const onDay = before.filter((s) => s.grade === "Grade 9" && s.section === "B" && s.dayOfWeek === d);
    const english = onDay.find((s) => s.subject.name === "English");
    const urdu = onDay.find((s) => s.subject.name === "Urdu");
    if (english && urdu) pairs.push({ d, english, urdu });
  }

  const predicted = sweep(simulate(before, pairs));

  /**
   * The plan is hardcoded to one pairing, so it is not a general solver. If the
   * conflicts on this database are not the ones it was written for, swapping
   * would move rows around for nothing — or make things worse. Refuse instead.
   */
  if (total(predicted) >= total(beforeSweep)) {
    console.log("\n=== REFUSED ===");
    report("before", beforeSweep);
    report("after", predicted);
    console.log(
      "\n  This plan does not improve these conflicts, so nothing was written." +
        "\n  It only knows one move — swapping Grade 9-B's English and Urdu — and" +
        "\n  that is not what this timetable needs. Resolve these by hand.\n"
    );
    await prismaRaw.$disconnect();
    process.exitCode = 1;
    return;
  }

  console.log("\n=== SWAPS ===");
  for (const p of pairs) {
    console.log(
      `  ${DAYS[p.d].padEnd(10)} English P${p.english.period} (${p.english.startTime}-${p.english.endTime})` +
        `  <->  Urdu P${p.urdu.period} (${p.urdu.startTime}-${p.urdu.endTime})`
    );
  }
  console.log(`\n  Predicted after: teacher=${predicted.teacher.length}  class=${predicted.class.length}  room=${predicted.room.length}`);

  if (!APPLY) {
    console.log(`\n  Dry run — nothing written. Re-run with --apply to commit.\n`);
    await prismaRaw.$disconnect();
    return;
  }

  /**
   * One transaction for the lot: a half-applied timetable is worse than the
   * conflicts it was meant to fix.
   *
   * Each swap goes through a temporary period because
   * @@unique([instituteId, grade, section, dayOfWeek, period]) would reject the
   * intermediate state where both rows briefly claim the same period.
   */
  await prismaRaw.$transaction(async (tx) => {
    for (const { english, urdu } of pairs) {
      await tx.timetableSlot.update({
        where: { id: english.id },
        data: { period: TEMP_PERIOD },
      });
      await tx.timetableSlot.update({
        where: { id: urdu.id },
        data: { period: english.period, startTime: english.startTime, endTime: english.endTime },
      });
      await tx.timetableSlot.update({
        where: { id: english.id },
        data: { period: urdu.period, startTime: urdu.startTime, endTime: urdu.endTime },
      });
    }
  });

  const after = await prismaRaw.timetableSlot.findMany({
    include: { subject: { select: { name: true } }, teacher: { select: { name: true } } },
  });

  console.log("\n=== CONFLICTS ===");
  report("before", beforeSweep);
  report("after", sweep(after));

  const parked = after.filter((s) => s.period === TEMP_PERIOD);
  console.log(`\n  rows: ${before.length} -> ${after.length}`);
  console.log(`  rows left parked on the temporary period: ${parked.length}`);

  await prismaRaw.$disconnect();
};

/**
 * The conflict logic is exported so it can be tested against constructed
 * timetables rather than against the real one. `sweep` and `simulate` are
 * pure, so the property that matters — applying the plan a second time must
 * not undo the first — is provable without touching a database.
 */
export { sweep, simulate, total, minutes, overlaps, TEMP_PERIOD };

// Only sweep the database when invoked directly; importing costs nothing.
const invokedDirectly =
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("scripts/fix-timetable-conflicts.js");

if (invokedDirectly) {
  main().catch(async (err) => {
    console.error(`\n  ✖ ${err.message}\n`);
    await prismaRaw.$disconnect();
    process.exit(1);
  });
}
