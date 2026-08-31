/**
 * A school that looks like a school, at the size a school actually is.
 *
 *   node scripts/seed-realistic.js                 → 2000 students, then purge
 *   node scripts/seed-realistic.js --keep          → leave it behind to poke at
 *   node scripts/seed-realistic.js --students 500
 *   node scripts/seed-realistic.js --purge-only <instituteId>
 *
 * `scale-probe.js` answers "does it hold up" and names everybody Student 417,
 * which is fine for timing a query and useless for looking at a screen: every
 * row sorts the same, every search matches everything, and nothing about the
 * roster tells you whether it reads like a register a head teacher would
 * recognise.
 *
 * So this one uses real Pakistani names, real cities, and a plausible spread of
 * marks and attendance — and it splits the school across campuses, because that
 * is the shape this feature exists for.
 *
 * Kaggle was the obvious source and needs an API token this machine does not
 * have. The generic name datasets that are public are US and Spanish, which
 * would have produced a Lahore school full of Jennifers. These lists are the
 * common names of the country the product is for, which is the point of using
 * real data at all.
 *
 * It builds its own institute and removes it again unless --keep is passed. It
 * never touches existing data.
 */
import { performance } from "node:perf_hooks";
import { prismaRaw } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/password.js";

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};
const KEEP = process.argv.includes("--keep");
const WANTED = Number(arg("--students")) > 0 ? Number(arg("--students")) : 2000;
const stamp = Date.now();

/* ── names ──────────────────────────────────────────────────────────────── */

const MALE = [
  "Ahmed", "Ali", "Bilal", "Danish", "Faisal", "Farhan", "Hamza", "Haris", "Hassan",
  "Hussain", "Ibrahim", "Imran", "Junaid", "Kamran", "Khurram", "Mudassir", "Muneeb",
  "Naveed", "Noman", "Omar", "Rehan", "Saad", "Salman", "Shahzaib", "Sharjeel",
  "Talha", "Taimoor", "Usman", "Waleed", "Wajahat", "Yasir", "Zain", "Zohaib",
  "Abdullah", "Abdul Rehman", "Arsalan", "Asad", "Awais", "Basit", "Daniyal",
  "Ehtisham", "Fahad", "Ghazanfar", "Hasnain", "Ihsan", "Jahanzaib", "Mustafa",
  "Rameez", "Shayan", "Zeeshan",
];

const FEMALE = [
  "Aiman", "Alishba", "Amna", "Anaya", "Areeba", "Ayesha", "Bushra", "Eman",
  "Fatima", "Hafsa", "Hania", "Hira", "Iqra", "Javeria", "Kainat", "Khadija",
  "Laiba", "Maryam", "Mahnoor", "Mehwish", "Minahil", "Nimra", "Noor", "Rabia",
  "Rimsha", "Sadia", "Saira", "Sana", "Sidra", "Sumaiya", "Tehreem", "Warda",
  "Zainab", "Zoya", "Aleena", "Arooj", "Aqsa", "Bisma", "Duaa", "Esha",
  "Fiza", "Hoorain", "Kiran", "Mahrukh", "Nayab", "Rida", "Shanzay", "Tooba",
  "Urwa", "Yusra",
];

const SURNAMES = [
  "Ahmed", "Ali", "Anwar", "Aslam", "Awan", "Baig", "Bhatti", "Butt", "Chaudhry",
  "Cheema", "Farooq", "Gill", "Gondal", "Hashmi", "Hussain", "Iqbal", "Javed",
  "Kayani", "Khan", "Khokhar", "Lodhi", "Malik", "Mehmood", "Mirza", "Mughal",
  "Nadeem", "Nasir", "Naqvi", "Qureshi", "Raja", "Rana", "Rashid", "Raza",
  "Riaz", "Sadiq", "Saeed", "Sheikh", "Siddiqui", "Sultan", "Tariq", "Warraich",
  "Yousaf", "Zafar", "Zaidi",
];

const TITLES = ["Mr.", "Ms.", "Ms.", "Mr."];

const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan"];

const SUBJECT_NAMES = [
  "Mathematics", "English", "Urdu", "Physics", "Chemistry", "Biology",
  "Computer Sc.", "Pak. Studies", "Islamiat", "Geography",
];

/* Deterministic enough to be reproducible within a run, varied enough to look real. */
let seed = 20260831;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const fullName = (gender) =>
  `${pick(gender === "Female" ? FEMALE : MALE)} ${pick(SURNAMES)}`;

/* ── shape of the school ─────────────────────────────────────────────────── */

const GRADES = ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10"];
const SECTIONS = ["A", "B", "C", "D"];
const CAMPUSES = [
  { name: "Gulberg Campus", code: "GLB", city: "Lahore", isMain: true },
  { name: "DHA Campus", code: "DHA", city: "Lahore" },
  { name: "Johar Town Campus", code: "JT", city: "Lahore" },
];
const SCHOOL_DAYS = 40;
const FEE_MONTHS = 3;

const line = (s = "") => console.log(s);
const chunked = async (rows, size, fn) => {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
};

const purge = async (id) => {
  await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  await prismaRaw.user.deleteMany({ where: { email: { contains: `.${id}@` } } }).catch(() => {});
};

const purgeOnly = process.argv.indexOf("--purge-only");
if (purgeOnly !== -1) {
  const id = process.argv[purgeOnly + 1];
  if (!id) {
    console.error("  --purge-only needs an institute id");
    process.exit(1);
  }
  await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  line(`  Purged ${id}`);
  await prismaRaw.$disconnect();
  process.exit(0);
}

/* ── build ───────────────────────────────────────────────────────────────── */

const t0 = performance.now();
const plan = await prismaRaw.plan.findFirst({ orderBy: { price: "desc" } });

const institute = await prismaRaw.institute.create({
  data: {
    name: `Roots Grammar School ${stamp % 100000}`,
    code: `RGS${stamp % 100000}`,
    email: `office.${stamp}@test.edu`,
    phone: "0423 5710101",
    city: "Lahore",
    status: "ACTIVE",
    planId: plan.id,
    studentLimit: 9999,
    timezone: "Asia/Karachi",
    defaultMonthlyFee: 9500,
  },
});

const adminEmail = `principal.${stamp}@test.edu`;
await prismaRaw.user.create({
  data: {
    name: "Dr. Shahid Mehmood",
    email: adminEmail,
    passwordHash: await hashPassword("RealSeed123"),
    role: "ADMIN",
    instituteId: institute.id,
  },
});

const branches = [];
for (const c of CAMPUSES) {
  branches.push(
    await prismaRaw.branch.create({
      data: { instituteId: institute.id, ...c, isMain: Boolean(c.isMain) },
    })
  );
}

/* teachers — one per subject per campus, give or take */
const teacherRows = [];
for (let i = 0; i < CAMPUSES.length * SUBJECT_NAMES.length; i += 1) {
  const gender = rnd() < 0.55 ? "Female" : "Male";
  const title = gender === "Female" ? "Ms." : pick(TITLES);
  teacherRows.push({
    instituteId: institute.id,
    branchId: branches[i % branches.length].id,
    code: `TCH${String(i + 1).padStart(3, "0")}`,
    name: `${title} ${fullName(gender)}`,
    email: `teacher${i + 1}.${stamp}@test.edu`,
    phone: `03${between(0, 4)}${between(10000000, 99999999)}`,
    designation: `${SUBJECT_NAMES[i % SUBJECT_NAMES.length]} Teacher`,
    qualification: pick(["M.Sc", "M.A", "B.Ed", "M.Phil", "B.S"]),
  });
}
await prismaRaw.teacher.createMany({ data: teacherRows });
const teachers = await prismaRaw.teacher.findMany({
  where: { instituteId: institute.id }, select: { id: true, branchId: true },
});

/* subjects — one set per grade, taught by a teacher on the same campus */
const subjectRows = [];
for (const grade of GRADES) {
  for (let n = 0; n < 6; n += 1) {
    const teacher = teachers[(GRADES.indexOf(grade) * 6 + n) % teachers.length];
    subjectRows.push({
      instituteId: institute.id,
      name: SUBJECT_NAMES[n % SUBJECT_NAMES.length],
      grade,
      code: `${grade.replace(/\D/g, "")}-${n}`,
      teacherId: teacher.id,
    });
  }
}
await prismaRaw.subject.createMany({ data: subjectRows });
const subjects = await prismaRaw.subject.findMany({
  where: { instituteId: institute.id }, select: { id: true, grade: true },
});

/* students — spread across grades, sections and campuses */
const perGrade = Math.ceil(WANTED / GRADES.length);
const studentRows = [];
let n = 0;
for (const grade of GRADES) {
  for (let i = 0; i < perGrade && n < WANTED; i += 1, n += 1) {
    const gender = rnd() < 0.48 ? "Female" : "Male";
    studentRows.push({
      instituteId: institute.id,
      branchId: branches[n % branches.length].id,
      code: `STU${String(n + 1).padStart(5, "0")}`,
      name: fullName(gender),
      grade,
      section: SECTIONS[i % SECTIONS.length],
      rollNo: `${2026 - GRADES.indexOf(grade)}-${String(n + 1).padStart(4, "0")}`,
      gender,
      bloodGroup: pick(["A+", "B+", "O+", "AB+", "A-", "O-"]),
      phone: `03${between(0, 4)}${between(10000000, 99999999)}`,
      address: `House ${between(1, 400)}, ${pick(["Block A", "Block B", "Phase 4", "Model Town", "Gulshan"])}, ${pick(CITIES)}`,
      status: "ACTIVE",
    });
  }
}
await chunked(studentRows, 500, (b) => prismaRaw.student.createMany({ data: b }));
const students = await prismaRaw.student.findMany({
  where: { instituteId: institute.id }, select: { id: true, grade: true },
});

const session = await prismaRaw.academicSession.create({
  data: {
    instituteId: institute.id,
    name: institute.currentSession,
    startsOn: new Date(Date.UTC(2026, 3, 1)),
    endsOn: new Date(Date.UTC(2027, 2, 31)),
    isCurrent: true,
  },
});

/* enrolments and marks — a bell-ish spread, not a flat line */
const byGrade = new Map();
for (const s of subjects) {
  if (!byGrade.has(s.grade)) byGrade.set(s.grade, []);
  byGrade.get(s.grade).push(s);
}
const enrolRows = [];
for (const st of students) {
  for (const sub of byGrade.get(st.grade) ?? []) {
    const base = between(35, 95);
    const score = Math.max(0, Math.min(100, Math.round((base + between(-8, 8) + base) / 2)));
    enrolRows.push({
      studentId: st.id,
      subjectId: sub.id,
      academicSessionId: session.id,
      currentScore: score,
      previousScore: Math.max(0, Math.min(100, score + between(-10, 10))),
    });
  }
}
await chunked(enrolRows, 1000, (b) =>
  prismaRaw.enrollment.createMany({ data: b, skipDuplicates: true })
);

/* attendance — most children turn up most days */
const attRows = [];
for (let d = 0; d < SCHOOL_DAYS; d += 1) {
  const date = new Date(Date.UTC(2026, 5, 1 + d));
  if ([0, 6].includes(date.getUTCDay())) continue;
  for (const st of students) {
    const r = rnd();
    attRows.push({
      instituteId: institute.id,
      studentId: st.id,
      date,
      status: r < 0.9 ? "PRESENT" : r < 0.95 ? "ABSENT" : r < 0.98 ? "LATE" : "LEAVE",
    });
  }
}
await chunked(attRows, 2000, (b) =>
  prismaRaw.attendance.createMany({ data: b, skipDuplicates: true })
);

/* fees — most paid, some not, and the paid ones carry what was received */
const feeRows = [];
for (let m = 0; m < FEE_MONTHS; m += 1) {
  for (const st of students) {
    const paid = rnd() < 0.78;
    feeRows.push({
      instituteId: institute.id,
      studentId: st.id,
      period: `2026-0${6 + m}`,
      title: "Monthly Fee",
      amount: 9500,
      dueDate: new Date(Date.UTC(2026, 5 + m, 10)),
      status: paid ? "PAID" : "PENDING",
      ...(paid && {
        paidAmount: 9500,
        paidAt: new Date(Date.UTC(2026, 5 + m, between(2, 9))),
        method: pick(["CASH", "BANK", "ONLINE"]),
      }),
    });
  }
}
await chunked(feeRows, 1000, (b) =>
  prismaRaw.feeInvoice.createMany({ data: b, skipDuplicates: true })
);

await prismaRaw.$executeRawUnsafe("ANALYZE students, teachers, enrollments, attendance, fee_invoices, branches");

const seconds = ((performance.now() - t0) / 1000).toFixed(1);

line();
line("  EduConnect — a school that reads like one");
line("  " + "═".repeat(58));
line(`  ${institute.name}  (${institute.code})`);
line(`  ${branches.length} campuses · ${students.length} students · ${teachers.length} teachers`);
line(`  ${enrolRows.length} enrolments · ${attRows.length} attendance · ${feeRows.length} challans`);
line(`  built in ${seconds}s`);
line();
line("  A few of the names it made:");
for (const s of studentRows.slice(0, 5)) line(`    ${s.name.padEnd(24)} ${s.grade} ${s.section} · ${s.rollNo}`);
line();

if (KEEP) {
  line(`  Kept. Sign in as ${adminEmail} / RealSeed123`);
  line(`  Remove it with:  node scripts/seed-realistic.js --purge-only ${institute.id}`);
} else {
  await purge(institute.id);
  line("  Purged.");
}
line();

await prismaRaw.$disconnect();
