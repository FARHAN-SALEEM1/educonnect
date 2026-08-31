/**
 * Builds one realistically sized school and times every screen against it.
 *
 *   node scripts/scale-probe.js            → seed, measure, purge
 *   node scripts/scale-probe.js --keep     → leave the school behind to poke at
 *
 * Everything in this project has been measured against six students. A real
 * school has hundreds, and several queries are deliberately unbounded — the
 * student list loads the whole cohort on every page because a page-local rank
 * would be meaningless. That is the right call and it is also the one most
 * likely to fall over first, so it is worth knowing where.
 *
 * The school it creates is its own: a fresh institute, purged at the end unless
 * --keep is passed. It never touches existing data.
 */
import { performance } from "node:perf_hooks";
import { prismaRaw } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/password.js";

const KEEP = process.argv.includes("--keep");
const stamp = Date.now();

/** A mid-size private school: 40 classes of ~30. */
const GRADES = ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10"];
const SECTIONS = ["A","B","C","D"];
/** --students N sizes the school; the default is a mid-size 1,200. */
const WANTED = (() => {
  const i = process.argv.indexOf("--students");
  const n = i === -1 ? NaN : Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
})();
const PER_SECTION = WANTED ? Math.ceil(WANTED / (GRADES.length * SECTIONS.length)) : 30;
const SUBJECTS_PER_CLASS = 8;
const SCHOOL_DAYS = 60;
const FEE_MONTHS = 3;

const line = (s = "") => console.log(s);
const ms = (n) => `${n.toFixed(0)} ms`;

/** Times one call and returns [label, milliseconds, note]. */
const time = async (label, fn) => {
  const t0 = performance.now();
  const note = await fn();
  return [label, performance.now() - t0, note ?? ""];
};

const chunked = async (rows, size, fn) => {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
};

const main = async () => {
  line();
  line("EduConnect — scale probe");
  line("=".repeat(62));

  const plan = await prismaRaw.plan.findFirst({ where: { id: "elite" } })
    ?? await prismaRaw.plan.findFirst();
  if (!plan) throw new Error("no plans in the database — run the seed first");

  const t0 = performance.now();

  const institute = await prismaRaw.institute.create({
    data: {
      name: `Scale Probe School ${stamp}`,
      code: `SCALE${stamp % 100000}`,
      email: `scale.${stamp}@test.edu`,
      phone: "03001234567",
      city: "Lahore",
      status: "ACTIVE",
      planId: plan.id,
      studentLimit: 9999,
      timezone: "Asia/Karachi",
    },
  });

  const session = await prismaRaw.academicSession.create({
    data: {
      instituteId: institute.id,
      name: "2026-27",
      startsOn: new Date("2026-04-01T00:00:00.000Z"),
      endsOn: new Date("2027-03-31T00:00:00.000Z"),
      isCurrent: true,
    },
  });

  const hash = await hashPassword("ScaleProbe123");
  const admin = await prismaRaw.user.create({
    data: {
      name: "Scale Admin",
      email: `scale.admin.${stamp}@test.edu`,
      passwordHash: hash,
      role: "ADMIN",
      instituteId: institute.id,
    },
  });

  // ── teachers ───────────────────────────────────────────────────────────
  const teacherRows = Array.from({ length: 40 }, (_, i) => ({
    instituteId: institute.id,
    code: `SPT${String(i + 1).padStart(3, "0")}`,
    name: `Teacher ${i + 1}`,
    email: `scale.t${i}.${stamp}@test.edu`,
  }));
  await prismaRaw.teacher.createMany({ data: teacherRows });
  const teachers = await prismaRaw.teacher.findMany({
    where: { instituteId: institute.id }, select: { id: true },
  });

  // ── subjects: one set per class ────────────────────────────────────────
  const NAMES = ["Mathematics","English","Urdu","Physics","Chemistry","Biology","Pak. Studies","Computer Sc."];
  const subjectRows = [];
  let sIdx = 0;
  for (const grade of GRADES) {
    for (let n = 0; n < SUBJECTS_PER_CLASS; n += 1) {
      subjectRows.push({
        instituteId: institute.id,
        name: NAMES[n],
        grade,
        code: `SP-${grade.replace(/\D/g, "")}-${n}`,
        teacherId: teachers[sIdx % teachers.length].id,
      });
      sIdx += 1;
    }
  }
  await prismaRaw.subject.createMany({ data: subjectRows });
  const subjects = await prismaRaw.subject.findMany({
    where: { instituteId: institute.id }, select: { id: true, grade: true },
  });
  const subjectsByGrade = new Map();
  for (const s of subjects) {
    if (!subjectsByGrade.has(s.grade)) subjectsByGrade.set(s.grade, []);
    subjectsByGrade.get(s.grade).push(s.id);
  }

  // ── students ───────────────────────────────────────────────────────────
  const studentRows = [];
  let roll = 0;
  for (const grade of GRADES) {
    for (const section of SECTIONS) {
      for (let n = 0; n < PER_SECTION; n += 1) {
        roll += 1;
        studentRows.push({
          instituteId: institute.id,
          code: `SPS${String(roll).padStart(5, "0")}`,
          name: `Student ${roll}`,
          grade,
          section,
          rollNo: `SP-${roll}`,
          status: "ACTIVE",
        });
      }
    }
  }
  await chunked(studentRows, 500, (batch) => prismaRaw.student.createMany({ data: batch }));
  const students = await prismaRaw.student.findMany({
    where: { instituteId: institute.id }, select: { id: true, grade: true },
  });

  // ── enrolments ─────────────────────────────────────────────────────────
  const enrolRows = [];
  for (const st of students) {
    for (const subjectId of subjectsByGrade.get(st.grade) ?? []) {
      enrolRows.push({
        studentId: st.id,
        subjectId,
        academicSessionId: session.id,
        currentScore: 40 + Math.floor(Math.random() * 60),
      });
    }
  }
  await chunked(enrolRows, 1000, (batch) => prismaRaw.enrollment.createMany({ data: batch }));
  const enrolments = await prismaRaw.enrollment.findMany({
    where: { student: { instituteId: institute.id } }, select: { id: true },
  });

  // ── marks: three per enrolment ─────────────────────────────────────────
  const markRows = [];
  for (const e of enrolments) {
    for (let n = 0; n < 3; n += 1) {
      const total = 100;
      markRows.push({
        enrollmentId: e.id,
        title: ["First Term","Mid Term","Final Term"][n],
        type: "EXAM",
        obtained: 40 + Math.floor(Math.random() * 60),
        total,
        takenOn: new Date(`2026-0${5 + n}-15T00:00:00.000Z`),
      });
    }
  }
  await chunked(markRows, 1000, (batch) => prismaRaw.assessment.createMany({ data: batch }));

  // ── attendance ─────────────────────────────────────────────────────────
  const attRows = [];
  for (let d = 0; d < SCHOOL_DAYS; d += 1) {
    const date = new Date(Date.UTC(2026, 4, 4 + d));
    for (const st of students) {
      attRows.push({
        instituteId: institute.id,
        studentId: st.id,
        date,
        status: Math.random() < 0.93 ? "PRESENT" : Math.random() < 0.6 ? "ABSENT" : "LATE",
      });
    }
  }
  await chunked(attRows, 2000, (batch) => prismaRaw.attendance.createMany({ data: batch, skipDuplicates: true }));

  // ── fees ───────────────────────────────────────────────────────────────
  const feeRows = [];
  for (let m = 0; m < FEE_MONTHS; m += 1) {
    for (const st of students) {
      // A settled challan carries what was actually received. Leaving
      // paidAmount null while calling it PAID gave the fee screen 48m
      // invoiced, 0 collected and a 0% rate — an arithmetic that no real
      // school could produce, because payInvoice always writes the amount.
      const paid = Math.random() < 0.8;
      feeRows.push({
        instituteId: institute.id,
        studentId: st.id,
        period: `2026-0${5 + m}`,
        title: `Monthly Fee`,
        amount: 8000,
        dueDate: new Date(Date.UTC(2026, 4 + m, 10)),
        status: paid ? "PAID" : "PENDING",
        ...(paid && {
          paidAmount: 8000,
          paidAt: new Date(Date.UTC(2026, 4 + m, 8)),
          method: "CASH",
        }),
      });
    }
  }
  await chunked(feeRows, 1000, (batch) => prismaRaw.feeInvoice.createMany({ data: batch, skipDuplicates: true }));

  /**
   * Let Postgres learn what was just written before timing anything.
   *
   * Without this the probe measures a database that has had a hundred thousand
   * rows inserted seconds ago and has no statistics for any of them, so the
   * planner guesses — and guesses badly. The first version of this script
   * reported the attendance endpoints at ten seconds and then at fifty
   * milliseconds on the next run, with no code change between them. That is the
   * benchmark being wrong, not the endpoint being slow: a real school's database
   * has autovacuum keeping these current.
   */
  await prismaRaw.$executeRawUnsafe("ANALYZE attendance, students, enrollments, assessments, fee_invoices");

  const seedMs = performance.now() - t0;

  line();
  line(`  school     ${students.length} students · ${teachers.length} teachers · ${subjects.length} subjects`);
  line(`  records    ${enrolments.length} enrolments · ${markRows.length} marks · ${attRows.length} attendance · ${feeRows.length} challans`);
  line(`  seeded in  ${(seedMs / 1000).toFixed(1)} s`);
  line();

  // ── measure ────────────────────────────────────────────────────────────
  const API = `http://localhost:${process.env.PORT || 5001}/api`;
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: admin.email, password: "ScaleProbe123" }),
  }).then((r) => r.json());
  const token = login?.data?.accessToken;
  if (!token) throw new Error("could not sign in — is the API running on 5001?");

  const get = async (path) => {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    return { status: res.status, body };
  };

  const oneStudent = students[Math.floor(students.length / 2)].id;

  const results = [];
  results.push(await time("GET /students (page 1)", async () => {
    const r = await get("/students?limit=25");
    return `${r.body.data?.length ?? 0} rows, ${r.body.meta?.total ?? "?"} total`;
  }));
  results.push(await time("GET /students (page 20)", async () => {
    const r = await get("/students?limit=25&page=20");
    return `${r.body.data?.length ?? 0} rows`;
  }));
  results.push(await time("GET /students/:id", async () => (await get(`/students/${oneStudent}`)).status));
  results.push(await time("GET /students/:id/report", async () => (await get(`/students/${oneStudent}/report`)).status));
  results.push(await time("GET /attendance/summary", async () => {
    const r = await get("/attendance/summary");
    return `${r.body.data?.total ?? "?"} records`;
  }));
  results.push(await time("GET /attendance (page 1)", async () => (await get("/attendance?limit=50")).status));
  results.push(await time("GET /dashboard/admin", async () => (await get("/dashboard/admin")).status));
  results.push(await time("GET /teachers", async () => {
    const r = await get("/teachers?limit=50");
    return `${r.body.data?.length ?? 0} rows`;
  }));
  results.push(await time("GET /fees (page 1)", async () => (await get("/fees?limit=50")).status));
  results.push(await time("GET /fees/stats", async () => (await get("/fees/stats")).status));
  results.push(await time("GET /subjects", async () => {
    const r = await get("/subjects");
    return `${r.body.data?.length ?? 0} rows`;
  }));

  line("  endpoint                          time        note");
  line("  " + "─".repeat(58));
  for (const [label, took, note] of results) {
    const flag = took > 2000 ? "  ⚠ SLOW" : took > 800 ? "  ·" : "";
    line(`  ${label.padEnd(32)} ${ms(took).padStart(9)}   ${note}${flag}`);
  }
  line();

  const slow = results.filter(([, t]) => t > 2000);
  line("=".repeat(62));
  line();
  if (slow.length) {
    line(`  ⚠ ${slow.length} endpoint(s) over 2 s at this size:`);
    for (const [label, took] of slow) line(`      ${label} — ${ms(took)}`);
    line();
    line("    Two seconds is the point where a screen stops feeling like software");
    line("    and starts feeling like a wait. A school's office opens all of these");
    line("    at once, every morning.");
  } else {
    line("  No endpoint took more than 2 s at this size.");
  }
  line();

  if (KEEP) {
    line(`  School kept: ${institute.name} (${institute.code})`);
    line(`  Sign in as ${admin.email} / ScaleProbe123`);
    line(`  Remove it with:  node scripts/scale-probe.js --purge-only ${institute.id}`);
  } else {
    await prismaRaw.institute.delete({ where: { id: institute.id } });
    line("  School purged. Nothing left behind.");
  }
  line();
};

// A purge-only mode, so a --keep run can be cleaned up later.
const purgeOnly = process.argv.indexOf("--purge-only");
if (purgeOnly > -1) {
  const id = process.argv[purgeOnly + 1];
  await prismaRaw.institute.delete({ where: { id } });
  console.log(`\n  Purged ${id}\n`);
} else {
  await main();
}
await prismaRaw.$disconnect();
