/**
 * Times the two ways of answering "what is this school's attendance?"
 *
 *   node scripts/attendance-bench.js
 *
 * The summary endpoint used to read every matching row and tally them in
 * JavaScript. That is the obvious way to write it and it is fine until a school
 * has a term of registers behind it. This measures both shapes against the same
 * freshly built data, so the difference is the query and not the weather.
 *
 * Builds its own school and removes it again.
 */
import { performance } from "node:perf_hooks";
import { prismaRaw } from "../src/config/prisma.js";

const STUDENTS = 1200;
const DAYS = 60;
const stamp = Date.now();

const ms = (n) => `${n.toFixed(0)} ms`;
const time = async (fn) => {
  const t0 = performance.now();
  const out = await fn();
  return [performance.now() - t0, out];
};

const plan = await prismaRaw.plan.findFirst();
const institute = await prismaRaw.institute.create({
  data: {
    name: `Attendance Bench ${stamp}`,
    code: `BENCH${stamp % 100000}`,
    email: `bench.${stamp}@test.edu`,
    phone: "03001234567",
    city: "Lahore",
    status: "ACTIVE",
    planId: plan.id,
    studentLimit: 9999,
    timezone: "Asia/Karachi",
  },
});

const studentRows = Array.from({ length: STUDENTS }, (_, i) => ({
  instituteId: institute.id,
  code: `BN${String(i).padStart(5, "0")}`,
  name: `Bench ${i}`,
  grade: `Grade ${(i % 10) + 1}`,
  section: ["A", "B", "C", "D"][i % 4],
  rollNo: `BN-${i}`,
  status: "ACTIVE",
}));
for (let i = 0; i < studentRows.length; i += 500) {
  await prismaRaw.student.createMany({ data: studentRows.slice(i, i + 500) });
}
const students = await prismaRaw.student.findMany({
  where: { instituteId: institute.id }, select: { id: true },
});

const attRows = [];
for (let d = 0; d < DAYS; d += 1) {
  const date = new Date(Date.UTC(2026, 4, 4 + d));
  for (const s of students) {
    attRows.push({
      instituteId: institute.id,
      studentId: s.id,
      date,
      status: Math.random() < 0.93 ? "PRESENT" : "ABSENT",
    });
  }
}
for (let i = 0; i < attRows.length; i += 2000) {
  await prismaRaw.attendance.createMany({ data: attRows.slice(i, i + 2000), skipDuplicates: true });
}

const where = { instituteId: institute.id, student: { deletedAt: null } };

console.log(`\n  ${STUDENTS} students × ${DAYS} days = ${attRows.length} attendance rows\n`);

// Warm the cache so neither shape pays for being first.
await prismaRaw.attendance.count({ where });

const [readAll, rows] = await time(() =>
  prismaRaw.attendance.findMany({ where, select: { status: true, date: true, studentId: true }, orderBy: { date: "asc" } })
);
const [grouped, groups] = await time(() =>
  prismaRaw.attendance.groupBy({ by: ["date", "status"], where, _count: { _all: true }, orderBy: { date: "asc" } })
);

console.log("  shape                                    time        rows returned");
console.log("  " + "─".repeat(62));
console.log(`  findMany + tally in Node               ${ms(readAll).padStart(9)}   ${rows.length}`);
console.log(`  groupBy (date, status) in Postgres     ${ms(grouped).padStart(9)}   ${groups.length}`);
console.log();
console.log(`  ${(readAll / grouped).toFixed(0)}× faster, and ${(rows.length / groups.length).toFixed(0)}× less data over the wire.`);
console.log();

await prismaRaw.institute.delete({ where: { id: institute.id } });
console.log("  Bench school purged.\n");
await prismaRaw.$disconnect();
