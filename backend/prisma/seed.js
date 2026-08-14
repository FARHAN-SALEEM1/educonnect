/**
 * Seeds the database with the demo data the EduConnect frontend expects —
 * same institutes, same logins, same students — so the UI has something
 * real to render the moment the API comes up.
 *
 * Safe to re-run: it wipes the tables it owns first.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const T = {
  forest: "#1B4332",
  green: "#2D6A4F",
  gold: "#C9A84C",
  clay: "#C1440E",
  purple: "#7C3AED",
  blue: "#2563EB",
  teal: "#0D9488",
  indigo: "#4F46E5",
};

const hash = (plain) => bcrypt.hashSync(plain, 10);

const monthsAgo = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

const periodKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const periodLabel = (period) => {
  const [y, m] = period.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${y}`;
};

const GRADE_BANDS = [
  [90, "A+"], [85, "A"], [80, "A−"], [75, "B+"], [70, "B"],
  [65, "B−"], [60, "C+"], [55, "C"], [50, "D"], [0, "F"],
];
const letterGrade = (score) => GRADE_BANDS.find(([min]) => score >= min)[1];
const predict = (cur, prev) =>
  Math.max(0, Math.min(100, Math.round(cur + (cur - prev) * 0.6)));

// ────────────────────────────────────────────────────────────────
// 1. Plans
// ────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 4999,
    maxStudents: 200,
    color: T.blue,
    features: [
      "Up to 200 students", "Basic analytics", "Email support",
      "Parent & Teacher portal", "Attendance tracking", "Fee management",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 12999,
    maxStudents: 800,
    color: T.forest,
    popular: true,
    features: [
      "Up to 800 students", "AI-powered insights", "Priority support",
      "All portals", "Advanced fee management", "SMS alerts", "Reports & exports",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 29999,
    maxStudents: 9999,
    color: T.purple,
    features: [
      "Unlimited students", "Full AI suite", "Dedicated account manager",
      "All portals", "Custom branding", "API access", "Multi-branch", "White-label option",
    ],
  },
];

const INSTITUTES = [
  {
    code: "INS001", name: "Beaconhouse School", city: "Lahore", planId: "growth",
    email: "admin@beaconhouse.edu", phone: "03001112220", logo: "🏫", color: T.forest,
    status: "ACTIVE", joinedAt: new Date("2025-08-01"), defaultMonthlyFee: 12500,
  },
  {
    code: "INS002", name: "LACAS", city: "Karachi", planId: "elite",
    email: "admin@lacas.edu", phone: "03213334440", logo: "🎓", color: T.purple,
    status: "ACTIVE", joinedAt: new Date("2025-09-15"), defaultMonthlyFee: 18000,
  },
  {
    code: "INS003", name: "The City School", city: "Islamabad", planId: "starter",
    email: "admin@citys.edu", phone: "03335556660", logo: "📚", color: T.blue,
    status: "ACTIVE", joinedAt: new Date("2025-11-01"), defaultMonthlyFee: 9500,
  },
];

// Subject catalogue for Beaconhouse (INS001)
const BHS_SUBJECTS = [
  { name: "Mathematics",  grade: "Grade 8", color: T.purple, teacherCode: "TCH001" },
  { name: "Computer Sc.", grade: "Grade 8", color: T.forest, teacherCode: "TCH004" },
  { name: "Urdu",         grade: "Grade 8", color: T.green,  teacherCode: "TCH005" },
  { name: "English",      grade: "Grade 8", color: T.blue,   teacherCode: "TCH006" },
  { name: "Physics",      grade: "Grade 8", color: T.gold,   teacherCode: "TCH002" },
  { name: "Chemistry",    grade: "Grade 8", color: T.clay,   teacherCode: "TCH003" },

  { name: "Mathematics",  grade: "Grade 9", color: T.purple, teacherCode: "TCH001" },
  { name: "Biology",      grade: "Grade 9", color: T.teal,   teacherCode: "TCH007" },
  { name: "Chemistry",    grade: "Grade 9", color: T.clay,   teacherCode: "TCH003" },
  { name: "English",      grade: "Grade 9", color: T.blue,   teacherCode: "TCH006" },
  { name: "Urdu",         grade: "Grade 9", color: T.green,  teacherCode: "TCH005" },
  { name: "Pak. Studies", grade: "Grade 9", color: T.gold,   teacherCode: "TCH008" },
];

const BHS_TEACHERS = [
  { code: "TCH001", name: "Mr. Hassan",  email: "hassan@bhs.edu",  phone: "03001111111", designation: "Senior Mathematics Teacher", qualification: "MSc Mathematics" },
  { code: "TCH002", name: "Ms. Nadia",   email: "nadia@bhs.edu",   phone: "03003333333", designation: "Physics Teacher", qualification: "MSc Physics" },
  { code: "TCH003", name: "Ms. Fatima",  email: "fatima@bhs.edu",  phone: "03004444444", designation: "Chemistry Teacher", qualification: "MSc Chemistry" },
  { code: "TCH004", name: "Ms. Hira",    email: "hira@bhs.edu",    phone: "03005555555", designation: "Computer Science Teacher", qualification: "BS Computer Science" },
  { code: "TCH005", name: "Mr. Tariq",   email: "tariq@bhs.edu",   phone: "03006666666", designation: "Urdu Teacher", qualification: "MA Urdu" },
  { code: "TCH006", name: "Mr. Ali",     email: "ali.t@bhs.edu",   phone: "03007777777", designation: "English Teacher", qualification: "MA English" },
  { code: "TCH007", name: "Ms. Sara",    email: "sara.t@bhs.edu",  phone: "03008888888", designation: "Biology Teacher", qualification: "MSc Biology" },
  { code: "TCH008", name: "Ms. Hina",    email: "hina@bhs.edu",    phone: "03009999999", designation: "Pak. Studies Teacher", qualification: "MA History" },
];

// Student performance mirrors the frontend's demo records.
const STUDENTS = [
  {
    code: "STU001", name: "Zain Ahmed", grade: "Grade 8", section: "A", rollNo: "2024-081",
    dob: new Date("2010-03-15"), gender: "Male", bloodGroup: "B+", phone: "03001234567",
    address: "House 12, Block C, DHA Lahore", parentCode: "PAR001",
    scores: [
      { subject: "Mathematics",  current: 91, previous: 85 },
      { subject: "Computer Sc.", current: 98, previous: 95 },
      { subject: "Urdu",         current: 94, previous: 90 },
      { subject: "English",      current: 85, previous: 85 },
      { subject: "Physics",      current: 78, previous: 72 },
      { subject: "Chemistry",    current: 72, previous: 80 },
    ],
    assessments: [
      { subject: "Mathematics",  title: "Quiz 3",     type: "QUIZ",       obtained: 18, total: 20, daysAgo: 4 },
      { subject: "Chemistry",    title: "Test 2",     type: "TEST",       obtained: 14, total: 20, daysAgo: 6 },
      { subject: "English",      title: "Assignment", type: "ASSIGNMENT", obtained: 17, total: 20, daysAgo: 8 },
      { subject: "Physics",      title: "Lab Report", type: "LAB",        obtained: 19, total: 20, daysAgo: 9 },
      { subject: "Computer Sc.", title: "Project",    type: "PROJECT",    obtained: 20, total: 20, daysAgo: 11 },
      { subject: "Chemistry",    title: "Quiz 2",     type: "QUIZ",       obtained: 11, total: 20, daysAgo: 16 },
      { subject: "Chemistry",    title: "Quiz 1",     type: "QUIZ",       obtained: 10, total: 20, daysAgo: 24 },
    ],
    attendancePattern: { present: 87, absent: 8, late: 5 },
  },
  {
    code: "STU002", name: "Ayesha Khan", grade: "Grade 9", section: "B", rollNo: "2024-092",
    dob: new Date("2009-07-22"), gender: "Female", bloodGroup: "A+", phone: "03009876543",
    address: "House 5, F-7/2, Islamabad", parentCode: "PAR002",
    scores: [
      { subject: "Mathematics",  current: 88, previous: 84 },
      { subject: "Biology",      current: 95, previous: 92 },
      { subject: "Chemistry",    current: 82, previous: 78 },
      { subject: "English",      current: 90, previous: 88 },
      { subject: "Urdu",         current: 79, previous: 75 },
      { subject: "Pak. Studies", current: 85, previous: 83 },
    ],
    assessments: [
      { subject: "Biology",     title: "Test 2",   type: "TEST", obtained: 19, total: 20, daysAgo: 4 },
      { subject: "Mathematics", title: "Quiz 3",   type: "QUIZ", obtained: 17, total: 20, daysAgo: 6 },
      { subject: "Chemistry",   title: "Lab Work", type: "LAB",  obtained: 18, total: 20, daysAgo: 8 },
    ],
    attendancePattern: { present: 92, absent: 5, late: 3 },
  },
  {
    code: "STU003", name: "Bilal Raza", grade: "Grade 8", section: "A", rollNo: "2024-083",
    dob: new Date("2010-01-09"), gender: "Male", bloodGroup: "O+", phone: "03002223344",
    address: "House 88, Model Town, Lahore", parentCode: "PAR003",
    scores: [
      { subject: "Mathematics",  current: 64, previous: 71 },
      { subject: "Computer Sc.", current: 76, previous: 70 },
      { subject: "Urdu",         current: 81, previous: 79 },
      { subject: "English",      current: 69, previous: 68 },
      { subject: "Physics",      current: 58, previous: 66 },
      { subject: "Chemistry",    current: 55, previous: 60 },
    ],
    assessments: [
      { subject: "Physics",   title: "Quiz 3", type: "QUIZ", obtained: 9,  total: 20, daysAgo: 4 },
      { subject: "Physics",   title: "Quiz 2", type: "QUIZ", obtained: 10, total: 20, daysAgo: 12 },
      { subject: "Physics",   title: "Quiz 1", type: "QUIZ", obtained: 11, total: 20, daysAgo: 20 },
      { subject: "Chemistry", title: "Test 2", type: "TEST", obtained: 11, total: 20, daysAgo: 6 },
    ],
    // Deliberately poor attendance so the insight engine has a case to flag.
    attendancePattern: { present: 68, absent: 24, late: 8 },
  },
  {
    code: "STU004", name: "Hania Malik", grade: "Grade 8", section: "A", rollNo: "2024-084",
    dob: new Date("2010-06-30"), gender: "Female", bloodGroup: "AB+", phone: "03004445566",
    address: "House 21, Gulberg III, Lahore", parentCode: "PAR003",
    scores: [
      { subject: "Mathematics",  current: 96, previous: 92 },
      { subject: "Computer Sc.", current: 93, previous: 91 },
      { subject: "Urdu",         current: 88, previous: 86 },
      { subject: "English",      current: 94, previous: 90 },
      { subject: "Physics",      current: 89, previous: 84 },
      { subject: "Chemistry",    current: 91, previous: 88 },
    ],
    assessments: [
      { subject: "Mathematics", title: "Quiz 3", type: "QUIZ", obtained: 20, total: 20, daysAgo: 4 },
      { subject: "English",     title: "Assignment", type: "ASSIGNMENT", obtained: 19, total: 20, daysAgo: 8 },
    ],
    attendancePattern: { present: 96, absent: 2, late: 2 },
  },
];

const PARENTS = [
  { code: "PAR001", name: "Sara Ahmed", email: "sara@gmail.com", phone: "03219876543", relation: "Mother", occupation: "Doctor" },
  { code: "PAR002", name: "Ali Khan",   email: "ali@gmail.com",  phone: "03218765432", relation: "Father", occupation: "Engineer" },
  { code: "PAR003", name: "Nida Raza",  email: "nida@gmail.com", phone: "03217654321", relation: "Mother", occupation: "Banker" },
];

const TIMETABLE = {
  "Grade 8|A": [
    ["Mathematics", "English", "Computer Sc.", "Physics", "Urdu", "Chemistry"],
    ["English", "Physics", "Mathematics", "Urdu", "Computer Sc.", "Chemistry"],
    ["Physics", "Mathematics", "Urdu", "Computer Sc.", "English", "Mathematics"],
    ["Urdu", "Computer Sc.", "Chemistry", "Mathematics", "Physics", "English"],
    ["Chemistry", "Urdu", "English", "Physics", "Mathematics", "Computer Sc."],
  ],
  "Grade 9|B": [
    ["Biology", "English", "Mathematics", "Chemistry", "Urdu", "Pak. Studies"],
    ["English", "Chemistry", "Biology", "Pak. Studies", "Mathematics", "Urdu"],
    ["Chemistry", "Biology", "Urdu", "Mathematics", "English", "Biology"],
    ["Urdu", "Mathematics", "Pak. Studies", "Biology", "Chemistry", "English"],
    ["Pak. Studies", "Urdu", "English", "Chemistry", "Biology", "Mathematics"],
  ],
};

const PERIOD_TIMES = [
  ["08:00", "08:45"], ["08:45", "09:30"], ["09:30", "10:15"],
  ["10:35", "11:20"], ["11:20", "12:05"], ["12:05", "12:50"],
];

const NOTICES = [
  { title: "Annual Exam Schedule Released", category: "ACADEMIC", daysAgo: 2, isPinned: true,
    body: "Annual examinations will begin April 15. The detailed timetable is on the school notice board and has been emailed to all parents." },
  { title: "Fee Deadline Reminder", category: "FINANCE", daysAgo: 4,
    body: "Last date to submit this month's fees without a late penalty is the 20th. Parents are requested to clear dues promptly." },
  { title: "Annual Science Fair Open", category: "EVENT", daysAgo: 6,
    body: "Registrations for the Annual Science Fair are now open. Students may register at the reception before the 18th." },
  { title: "Revised Summer Timings", category: "GENERAL", daysAgo: 9,
    body: "From April 1, school hours change to 7:30 AM – 1:00 PM. Please adjust drop-off and pick-up accordingly." },
  { title: "Staff Meeting — Friday 2 PM", category: "GENERAL", daysAgo: 1, audience: ["TEACHER"],
    body: "All teaching staff are required to attend the monthly review meeting in the conference room." },
];

async function main() {
  console.log("🌱 Seeding EduConnect database…\n");

  // ── Reset ────────────────────────────────────────────────────
  console.log("   Clearing existing data…");
  await prisma.auditLog.deleteMany();
  await prisma.aiInsight.deleteMany();
  await prisma.message.deleteMany();
  await prisma.notice.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.feeInvoice.deleteMany();
  await prisma.timetableSlot.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.subscriptionInvoice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.institute.deleteMany();
  await prisma.plan.deleteMany();

  // ── Plans ────────────────────────────────────────────────────
  for (const plan of PLANS) await prisma.plan.create({ data: plan });
  console.log(`   ✓ ${PLANS.length} plans`);

  // ── Institutes ───────────────────────────────────────────────
  const institutes = {};
  for (const inst of INSTITUTES) {
    institutes[inst.code] = await prisma.institute.create({ data: inst });
  }
  console.log(`   ✓ ${INSTITUTES.length} institutes`);

  const bhs = institutes.INS001;
  const lacas = institutes.INS002;
  const tcs = institutes.INS003;

  // ── Subscription billing history (Super Admin revenue view) ──
  for (const inst of Object.values(institutes)) {
    const plan = PLANS.find((p) => p.id === inst.planId);
    for (let i = 11; i >= 0; i--) {
      const date = monthsAgo(i);
      if (date < inst.joinedAt) continue;
      await prisma.subscriptionInvoice.create({
        data: {
          instituteId: inst.id,
          planId: plan.id,
          period: periodKey(date),
          amount: plan.price,
          // The current month is still outstanding; everything before is paid.
          status: i === 0 ? "PENDING" : "PAID",
          issuedAt: date,
          paidAt: i === 0 ? null : date,
        },
      });
    }
  }
  console.log("   ✓ subscription invoices");

  // ── Users ────────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      name: "Platform Admin", email: "sa@educonnect.io",
      passwordHash: hash("super123"), role: "SUPERADMIN", instituteId: null,
    },
  });

  const bhsAdmin = await prisma.user.create({
    data: {
      name: "Dr. Imran Sheikh", email: "admin@bhs.edu", phone: "03001010101",
      passwordHash: hash("admin123"), role: "ADMIN", instituteId: bhs.id,
    },
  });

  await prisma.user.create({
    data: {
      name: "Ms. Rabia Noor", email: "admin@lacas.edu", phone: "03002020202",
      passwordHash: hash("admin123"), role: "ADMIN", instituteId: lacas.id,
    },
  });

  await prisma.user.create({
    data: {
      name: "Mr. Kamran Butt", email: "admin@citys.edu", phone: "03003030303",
      passwordHash: hash("admin123"), role: "ADMIN", instituteId: tcs.id,
    },
  });

  // ── Teachers (with logins) ───────────────────────────────────
  const teachers = {};
  for (const t of BHS_TEACHERS) {
    const user = await prisma.user.create({
      data: {
        name: t.name, email: t.email, phone: t.phone,
        passwordHash: hash("teach123"), role: "TEACHER", instituteId: bhs.id,
      },
    });
    teachers[t.code] = await prisma.teacher.create({
      data: { ...t, instituteId: bhs.id, userId: user.id },
    });
  }
  console.log(`   ✓ ${BHS_TEACHERS.length} teachers (password: teach123)`);

  // ── Parents (with logins) ────────────────────────────────────
  const parents = {};
  for (const p of PARENTS) {
    const user = await prisma.user.create({
      data: {
        name: p.name, email: p.email, phone: p.phone,
        passwordHash: hash("parent123"), role: "PARENT", instituteId: bhs.id,
      },
    });
    parents[p.code] = await prisma.parent.create({
      data: { ...p, instituteId: bhs.id, userId: user.id },
    });
  }
  console.log(`   ✓ ${PARENTS.length} parents (password: parent123)`);

  // ── Subjects ─────────────────────────────────────────────────
  const subjects = {};
  for (const s of BHS_SUBJECTS) {
    const record = await prisma.subject.create({
      data: {
        name: s.name,
        grade: s.grade,
        color: s.color,
        instituteId: bhs.id,
        teacherId: teachers[s.teacherCode].id,
      },
    });
    subjects[`${s.grade}|${s.name}`] = record;
  }
  console.log(`   ✓ ${BHS_SUBJECTS.length} subjects`);

  // ── Students, enrollments, assessments ───────────────────────
  const students = {};
  for (const s of STUDENTS) {
    const { scores, assessments, attendancePattern, parentCode, ...data } = s;

    const student = await prisma.student.create({
      data: {
        ...data,
        instituteId: bhs.id,
        parentId: parents[parentCode].id,
        admittedAt: new Date("2024-08-15"),
      },
    });
    students[s.code] = { record: student, meta: s };

    for (const score of scores) {
      const subject = subjects[`${s.grade}|${score.subject}`];
      if (!subject) continue;

      const enrollment = await prisma.enrollment.create({
        data: {
          studentId: student.id,
          subjectId: subject.id,
          currentScore: score.current,
          previousScore: score.previous,
          letterGrade: letterGrade(score.current),
          predictedScore: predict(score.current, score.previous),
        },
      });

      for (const a of assessments.filter((x) => x.subject === score.subject)) {
        const takenOn = new Date();
        takenOn.setDate(takenOn.getDate() - a.daysAgo);
        await prisma.assessment.create({
          data: {
            enrollmentId: enrollment.id,
            title: a.title,
            type: a.type,
            obtained: a.obtained,
            total: a.total,
            takenOn,
          },
        });
      }
    }
  }
  console.log(`   ✓ ${STUDENTS.length} students with enrollments + assessments`);

  // ── Attendance: 60 school days per student ───────────────────
  let attendanceRows = 0;
  for (const { record, meta } of Object.values(students)) {
    const { present, absent, late } = meta.attendancePattern;
    const total = present + absent + late;

    // Build a shuffled bag matching the student's ratios, then deal it out
    // day by day so the history is realistic rather than uniform.
    const bag = [
      ...Array(present).fill("PRESENT"),
      ...Array(absent).fill("ABSENT"),
      ...Array(late).fill("LATE"),
    ];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }

    const rows = [];
    let dayOffset = 0;
    for (let i = 0; i < 60; i++) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - dayOffset);
      dayOffset += 1;

      // Skip weekends — schools don't take attendance on Sat/Sun.
      if (date.getDay() === 0 || date.getDay() === 6) {
        i -= 1;
        continue;
      }

      rows.push({
        studentId: record.id,
        instituteId: bhs.id,
        date,
        status: bag[i % total],
      });
    }

    await prisma.attendance.createMany({ data: rows });
    attendanceRows += rows.length;
  }
  console.log(`   ✓ ${attendanceRows} attendance records`);

  // ── Fee invoices: last 4 months ──────────────────────────────
  let invoiceCount = 0;
  for (const { record } of Object.values(students)) {
    for (let i = 3; i >= 0; i--) {
      const date = monthsAgo(i);
      const period = periodKey(date);
      const paid = i > 0; // current month still pending

      await prisma.feeInvoice.create({
        data: {
          studentId: record.id,
          instituteId: bhs.id,
          period,
          title: periodLabel(period),
          amount: bhs.defaultMonthlyFee,
          dueDate: new Date(date.getFullYear(), date.getMonth(), 10),
          status: paid ? "PAID" : "PENDING",
          paidAt: paid ? new Date(date.getFullYear(), date.getMonth(), 5) : null,
          paidAmount: paid ? bhs.defaultMonthlyFee : null,
          method: paid ? "Bank Transfer" : null,
        },
      });
      invoiceCount += 1;
    }
  }
  console.log(`   ✓ ${invoiceCount} fee invoices`);

  // ── Timetable ────────────────────────────────────────────────
  let slotCount = 0;
  for (const [key, week] of Object.entries(TIMETABLE)) {
    const [grade, section] = key.split("|");

    for (let dayIndex = 0; dayIndex < week.length; dayIndex++) {
      const periods = week[dayIndex];

      for (let periodIndex = 0; periodIndex < periods.length; periodIndex++) {
        const subject = subjects[`${grade}|${periods[periodIndex]}`];
        if (!subject) continue;

        await prisma.timetableSlot.create({
          data: {
            instituteId: bhs.id,
            grade,
            section,
            dayOfWeek: dayIndex + 1, // 1 = Monday
            period: periodIndex + 1,
            subjectId: subject.id,
            teacherId: subject.teacherId,
            startTime: PERIOD_TIMES[periodIndex][0],
            endTime: PERIOD_TIMES[periodIndex][1],
            room: `${grade.replace(/\D/g, "")}-${section}`,
          },
        });
        slotCount += 1;
      }
    }
  }
  console.log(`   ✓ ${slotCount} timetable slots`);

  // ── Notices ──────────────────────────────────────────────────
  for (const n of NOTICES) {
    const publishedAt = new Date();
    publishedAt.setDate(publishedAt.getDate() - n.daysAgo);

    await prisma.notice.create({
      data: {
        instituteId: bhs.id,
        title: n.title,
        body: n.body,
        category: n.category,
        audience: n.audience ?? [],
        isPinned: n.isPinned ?? false,
        publishedAt,
        createdById: bhsAdmin.id,
      },
    });
  }
  console.log(`   ✓ ${NOTICES.length} notices`);

  // ── Messages ─────────────────────────────────────────────────
  const nadiaUser = await prisma.user.findUnique({ where: { email: "nadia@bhs.edu" } });
  const hassanUser = await prisma.user.findUnique({ where: { email: "hassan@bhs.edu" } });
  const hiraUser = await prisma.user.findUnique({ where: { email: "hira@bhs.edu" } });
  const saraUser = await prisma.user.findUnique({ where: { email: "sara@gmail.com" } });

  const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);

  const thread = await prisma.message.create({
    data: {
      instituteId: bhs.id, senderId: nadiaUser.id, recipientId: saraUser.id,
      subject: "Physics Exam Preparation",
      body: "Dear Sara, please ensure Zain revises chapters 4–6 thoroughly before the upcoming exam. His lab work has improved significantly but the theory needs more attention. Kindly arrange revision time this weekend.",
      studentId: students.STU001.record.id, isRead: false, createdAt: hoursAgo(2),
    },
  });

  await prisma.message.create({
    data: {
      instituteId: bhs.id, senderId: saraUser.id, recipientId: nadiaUser.id,
      subject: "Re: Physics Exam Preparation",
      body: "Thank you for the update. We will ensure Zain revises this weekend. Could you please share a list of the most important topics so we can focus accordingly?",
      parentId: thread.id, studentId: students.STU001.record.id,
      isRead: true, readAt: hoursAgo(1), createdAt: hoursAgo(1),
    },
  });

  await prisma.message.create({
    data: {
      instituteId: bhs.id, senderId: hassanUser.id, recipientId: saraUser.id,
      subject: "Olympiad Selection",
      body: "It is my pleasure to inform you that Zain has been selected for the inter-school Mathematics Olympiad. Please confirm his participation by Friday so we can arrange preparation sessions.",
      studentId: students.STU001.record.id, isRead: false, createdAt: hoursAgo(26),
    },
  });

  await prisma.message.create({
    data: {
      instituteId: bhs.id, senderId: bhsAdmin.id, recipientId: saraUser.id,
      subject: "Parent-Teacher Meeting",
      body: "You are cordially invited to the quarterly parent-teacher meeting on the 18th at 10:00 AM in the school auditorium. Kindly confirm your attendance.",
      isRead: true, readAt: hoursAgo(40), createdAt: hoursAgo(48),
    },
  });

  await prisma.message.create({
    data: {
      instituteId: bhs.id, senderId: hiraUser.id, recipientId: saraUser.id,
      subject: "Outstanding Project",
      body: "I am pleased to inform you that Zain scored full marks on his database design project. He demonstrated an excellent understanding of the subject. I encourage nurturing this interest at home.",
      studentId: students.STU001.record.id, isRead: true, readAt: hoursAgo(60), createdAt: hoursAgo(72),
    },
  });
  console.log("   ✓ 5 messages");

  // ── AI insights (real engine, real data) ─────────────────────
  const { generateInsightsForStudent } = await import("../src/services/insight.service.js");
  let insightCount = 0;
  for (const { record } of Object.values(students)) {
    const generated = await generateInsightsForStudent(record.id);
    insightCount += generated.length;
  }
  console.log(`   ✓ ${insightCount} AI insights generated`);

  console.log(`
✅ Seed complete.

   Demo logins
   ────────────────────────────────────────────────
   Super Admin   sa@educonnect.io      super123
   Admin (BHS)   admin@bhs.edu         admin123
   Admin (LACAS) admin@lacas.edu       admin123
   Teacher       hassan@bhs.edu        teach123
   Teacher       nadia@bhs.edu         teach123
   Parent        sara@gmail.com        parent123
   Parent        ali@gmail.com         parent123
   ────────────────────────────────────────────────
`);
}

main()
  .catch((err) => {
    console.error("\n❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



