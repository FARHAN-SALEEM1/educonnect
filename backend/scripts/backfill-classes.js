import "dotenv/config";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Creates an AcademicClass for every (grade, section) pair that already exists
 * in the data, and points the existing timetable slots at it.
 *
 * Written for the migration that introduced AcademicClass: 60 timetable slots
 * and 4 students predate the table, and without this they would sit under a
 * class the admin screen has no record of.
 *
 * Idempotent and additive. It creates nothing that already exists, never
 * deletes, and never touches a student — class membership stays derived from
 * Student.grade/section, which is what the rest of the app reads.
 *
 *   node scripts/backfill-classes.js            # report only
 *   node scripts/backfill-classes.js --apply    # write
 */

const APPLY = process.argv.includes("--apply");

/** "2026-27" from a date in the Aug–Jul school year. */
const academicYearFor = (date = new Date()) => {
  const y = date.getUTCFullYear();
  // A school year starting in August runs into the next calendar year.
  const start = date.getUTCMonth() >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

/** "Grade 8" + "A" -> "8A"; "BSCS" + "3" -> "BSCS3". Digits win when present. */
const codeFor = (name, section) => {
  const digits = name.match(/\d+/)?.[0];
  const base = digits ?? name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6);
  return `${base}${section}`.toUpperCase();
};

const main = async () => {
  const year = academicYearFor();
  console.log(`\n  Backfilling academic classes for ${year}\n`);

  const institutes = await prismaRaw.institute.findMany({ select: { id: true, code: true, name: true } });
  let created = 0;
  let linked = 0;

  for (const institute of institutes) {
    // Every class that exists in the data, from either side.
    const [fromStudents, fromSlots] = await Promise.all([
      prismaRaw.student.groupBy({
        by: ["grade", "section"],
        where: { instituteId: institute.id, deletedAt: null },
      }),
      prismaRaw.timetableSlot.groupBy({
        by: ["grade", "section"],
        where: { instituteId: institute.id },
      }),
    ]);

    const pairs = new Map();
    for (const p of [...fromStudents, ...fromSlots]) {
      pairs.set(`${p.grade}|${p.section}`, { name: p.grade, section: p.section });
    }
    if (!pairs.size) continue;

    console.log(`  ${institute.code} ${institute.name} — ${pairs.size} class(es)`);

    for (const { name, section } of pairs.values()) {
      const existing = await prismaRaw.academicClass.findFirst({
        where: { instituteId: institute.id, academicYear: year, name, section },
      });

      let cls = existing;
      if (!cls) {
        const [students, slots] = await Promise.all([
          prismaRaw.student.count({ where: { instituteId: institute.id, grade: name, section, deletedAt: null } }),
          prismaRaw.timetableSlot.count({ where: { instituteId: institute.id, grade: name, section } }),
        ]);
        // The room the timetable already uses, if it is consistent.
        const rooms = await prismaRaw.timetableSlot.groupBy({
          by: ["room"],
          where: { instituteId: institute.id, grade: name, section, room: { not: null } },
        });

        const data = {
          instituteId: institute.id,
          name,
          section,
          code: codeFor(name, section),
          academicYear: year,
          room: rooms.length === 1 ? rooms[0].room : null,
        };
        console.log(`    + ${data.code.padEnd(10)} ${name} ${section}   ${students} student(s), ${slots} slot(s)`);
        if (APPLY) {
          cls = await prismaRaw.academicClass.create({ data });
          created += 1;
        }
      } else {
        console.log(`    = ${cls.code.padEnd(10)} ${name} ${section}   already present`);
      }

      if (APPLY && cls) {
        const { count } = await prismaRaw.timetableSlot.updateMany({
          where: { instituteId: institute.id, grade: name, section, classId: null },
          data: { classId: cls.id, academicYear: year },
        });
        linked += count;
        if (count) console.log(`      linked ${count} timetable slot(s)`);
      }
    }
  }

  console.log(
    APPLY
      ? `\n  Done — ${created} class(es) created, ${linked} slot(s) linked.\n`
      : `\n  Dry run. Nothing was written. Re-run with --apply to commit.\n`
  );

  await prismaRaw.$disconnect();
};

main().catch(async (err) => {
  console.error(`\n  ✖ ${err.message}\n`);
  await prismaRaw.$disconnect();
  process.exit(1);
});
