import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { policyFor } from "../services/grading.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { liveEnrolmentFilter, readSessionId, sessionFilter } from "../services/session.service.js";
import { ok } from "../utils/response.js";
import { PLAN_PUBLIC } from "../utils/publicFields.js";
import {
  attendanceSummary,
  averageScore,
  periodKey,
  periodLabel,
} from "../utils/academics.js";
import { DEFAULT_TIMEZONE, daysBefore, isoDayOfWeek, todayIn } from "../utils/dates.js";
import {
  effectiveStudentLimit,
  seatsRemaining,
  subscriptionSummary,
} from "../utils/subscription.js";

/**
 * "Today" for a school is a calendar date in *its* timezone, not the server's.
 * See utils/dates.js.
 */
const zoneFor = async (instituteId) => {
  if (!instituteId) return DEFAULT_TIMEZONE;
  const inst = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: { timezone: true },
  });
  return inst?.timezone || DEFAULT_TIMEZONE;
};

const lastNMonths = (n) =>
  Array.from({ length: n }, (c, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (n - 1 - i));
    return periodKey(d);
  });

/**
 * GET /api/dashboard/superadmin
 * Platform-wide KPIs, MRR, revenue trend and plan mix.
 */
export const superAdminDashboard = asyncHandler(async (_req, res) => {
  const [institutes, students, teachers, parents, users, plans, recentInstitutes, invoices] =
    await Promise.all([
      prisma.institute.count(),
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.parent.count(),
      prisma.user.count(),
      /**
       * Plans, counting only the schools that are actually paying.
       *
       * This counted every institute on each plan, while `mrr` below counts
       * only the ACTIVE ones — so the Super Admin dashboard showed a revenue
       * breakdown that did not add up to its own headline. With one suspended
       * school the two differed by exactly that school's fee: Rs. 65,995 broken
       * down under a total of Rs. 60,996, and nothing on the screen explaining
       * which was right.
       *
       * `deletedAt` is spelt out because `_count` is a nested read that the
       * soft-delete extension does not reach — the same reason the recent
       * institutes query below has to say it too.
       */
      prisma.plan.findMany({
        include: {
          _count: { select: { institutes: { where: { status: "ACTIVE", deletedAt: null } } } },
        },
      }),
      prisma.institute.findMany({
        take: 6,
        orderBy: { joinedAt: "desc" },
        // `_count` is a nested read the soft-delete extension doesn't reach,
        // so removed students would otherwise inflate each school's headline.
        include: { plan: { select: PLAN_PUBLIC }, _count: { select: { students: { where: { deletedAt: null } } } } },
      }),
      prisma.subscriptionInvoice.findMany({
        where: { period: { in: lastNMonths(12) } },
        select: { period: true, amount: true, status: true },
      }),
    ]);

  const byStatus = await prisma.institute.groupBy({ by: ["status"], _count: true });

  // MRR counts only institutes that are actually active — and so does the plan
  // breakdown above, so the parts add up to this total by construction.
  const activeInstitutes = await prisma.institute.findMany({
    where: { status: "ACTIVE" },
    include: { plan: { select: { price: true } } },
  });
  const mrr = activeInstitutes.reduce((sum, i) => sum + i.plan.price, 0);

  const revenueByMonth = lastNMonths(12).map((period) => {
    const rows = invoices.filter((i) => i.period === period);
    return {
      period,
      label: periodLabel(period),
      billed: rows.reduce((s, r) => s + r.amount, 0),
      collected: rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amount, 0),
    };
  });

  const collectedTotal = invoices
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + i.amount, 0);
  const pendingTotal = invoices
    .filter((i) => i.status === "PENDING")
    .reduce((s, i) => s + i.amount, 0);

  return ok(res, {
    kpis: {
      institutes,
      students,
      teachers,
      parents,
      users,
      mrr,
      arr: mrr * 12,
      collectedTotal,
      pendingTotal,
      avgStudentsPerInstitute: institutes ? Math.round(students / institutes) : 0,
    },
    instituteStatus: byStatus.reduce((acc, r) => ({ ...acc, [r.status]: r._count }), {}),
    planDistribution: plans.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      color: p.color,
      institutes: p._count.institutes,
      monthlyRevenue: p._count.institutes * p.price,
    })),
    revenueByMonth,
    recentInstitutes: recentInstitutes.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      city: i.city,
      logo: i.logo,
      status: i.status,
      plan: i.plan.name,
      planColor: i.plan.color,
      students: i._count.students,
      joinedAt: i.joinedAt,
    })),
  });
});

/**
 * GET /api/dashboard/admin
 * Institute-level overview: headcount, today's attendance, fee collection,
 * grade distribution, top performers, students needing attention.
 */
export const adminDashboard = asyncHandler(async (req, res) => {
  const instituteId = req.instituteId;
  /**
   * Every academic figure on this screen is about one year.
   *
   * A class average or a top-performers list drawn from two years at once
   * would rank a promoted student on marks from a class they have left.
   */
  const sessionId = await readSessionId(instituteId);
  if (!instituteId) throw ApiError.badRequest("instituteId is required");

  /**
   * The school's own scale, not the platform's.
   *
   * Bands and the pass mark are set per school, but only the result card ever
   * asked — so a school that moved A+ to 80 saw it on the card and nowhere
   * else on this screen.
   */
  const grading = await policyFor(instituteId);

  const today = todayIn(await zoneFor(instituteId));

  const [institute, students, teachers, parents, todayAttendance, feeRows, notices] =
    await Promise.all([
      prisma.institute.findUnique({ where: { id: instituteId }, include: { plan: { select: PLAN_PUBLIC } } }),
      prisma.student.count({ where: { instituteId, status: "ACTIVE" } }),
      prisma.teacher.count({ where: { instituteId, isActive: true } }),
      prisma.parent.count({ where: { instituteId } }),
      prisma.attendance.findMany({ where: { instituteId, date: today }, select: { status: true } }),
      prisma.feeInvoice.groupBy({
        by: ["status"],
        where: { instituteId },
        _sum: { amount: true, paidAmount: true },
        _count: true,
      }),
      prisma.notice.findMany({
        where: { instituteId },
        take: 5,
        orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
        select: { id: true, title: true, category: true, publishedAt: true, body: true },
      }),
    ]);

  if (!institute) throw ApiError.notFound("Institute not found");

  // How many students actually owe something — used by the fee alert tile,
  // which previously showed a hardcoded "7 students".
  const unpaidStudents = (
    await prisma.feeInvoice.groupBy({
      by: ["studentId"],
      where: { instituteId, status: { in: ["PENDING", "OVERDUE"] } },
    })
  ).length;

  // Fee figures
  const fees = { collected: 0, pending: 0, overdue: 0 };
  for (const row of feeRows) {
    if (row.status === "PAID") fees.collected += row._sum.paidAmount ?? row._sum.amount ?? 0;
    else if (row.status === "PENDING") fees.pending += row._sum.amount ?? 0;
    else if (row.status === "OVERDUE") fees.overdue += row._sum.amount ?? 0;
  }
  const collectible = fees.collected + fees.pending + fees.overdue;

  // Per-grade breakdown + performance
  const allStudents = await prisma.student.findMany({
    where: { instituteId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      grade: true,
      section: true,
      rollNo: true,
      enrollments: { where: sessionFilter(sessionId), select: { currentScore: true } },
    },
  });

  const gradeMap = new Map();
  for (const s of allStudents) {
    if (!gradeMap.has(s.grade)) gradeMap.set(s.grade, { grade: s.grade, students: 0, scores: [] });
    const entry = gradeMap.get(s.grade);
    entry.students += 1;
    const avg = averageScore(s.enrollments);
    if (avg) entry.scores.push(avg);
  }

  const gradeBreakdown = [...gradeMap.values()]
    .map((g) => ({
      grade: g.grade,
      students: g.students,
      average: g.scores.length
        ? Number((g.scores.reduce((a, b) => a + b, 0) / g.scores.length).toFixed(1))
        : 0,
    }))
    .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }));

  const ranked = allStudents
    .map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      section: s.section,
      rollNo: s.rollNo,
      average: averageScore(s.enrollments),
      gpa: grading.gpa(s.enrollments),
    }))
    .filter((s) => s.average > 0)
    .sort((a, b) => b.average - a.average);

  // Attendance rate over the last 30 days
  const thirtyDaysAgo = daysBefore(today, 30);
  const monthAttendance = await prisma.attendance.findMany({
    where: { instituteId, date: { gte: thirtyDaysAgo } },
    select: { status: true, date: true },
  });

  const trendMap = new Map();
  for (const r of monthAttendance) {
    const key = r.date.toISOString().slice(0, 10);
    if (!trendMap.has(key)) trendMap.set(key, []);
    trendMap.get(key).push(r);
  }

  return ok(res, {
    institute: {
      id: institute.id,
      code: institute.code,
      name: institute.name,
      city: institute.city,
      logo: institute.logo,
      color: institute.color,
      status: institute.status,
      plan: institute.plan,
      seatsUsed: students,
      seatsLimit: effectiveStudentLimit(institute),
      seatsRemaining: seatsRemaining(institute, students),
      subscription: subscriptionSummary(institute, students),
    },
    kpis: {
      students,
      teachers,
      parents,
      todayPresent: todayAttendance.filter((a) => a.status === "PRESENT").length,
      todayAbsent: todayAttendance.filter((a) => a.status === "ABSENT").length,
      todayLate: todayAttendance.filter((a) => a.status === "LATE").length,
      todayLeave: todayAttendance.filter((a) => a.status === "LEAVE").length,
      todayMarkedCount: todayAttendance.length,
      attendanceMarkedToday: todayAttendance.length > 0,
      // Null, not 0, when no register exists — the UI must distinguish
      // "nobody came in" from "nobody has taken the register yet".
      attendanceRateToday: todayAttendance.length ? attendanceSummary(todayAttendance).rate : null,
      attendanceRate30Days: monthAttendance.length ? attendanceSummary(monthAttendance).rate : null,
    },
    fees: {
      ...fees,
      outstanding: fees.pending + fees.overdue,
      unpaidStudents,
      // Null when nothing has ever been invoiced — a new school has no
      // collection rate, and showing 0% would read as a failure to collect.
      collectionRate: collectible ? Number(((fees.collected / collectible) * 100).toFixed(1)) : null,
    },
    gradeBreakdown,
    topPerformers: ranked.slice(0, 5),
    needsAttention: ranked.filter((s) => s.average < 60).slice(0, 5),
    attendanceTrend: [...trendMap.entries()]
      .map(([date, rows]) => ({ date, ...attendanceSummary(rows) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    recentNotices: notices,
  });
});

/**
 * GET /api/dashboard/teacher
 * What the signed-in teacher needs on landing: their classes, today's
 * marking status, recent marks entered and unread messages.
 */
export const teacherDashboard = asyncHandler(async (req, res) => {
  if (!req.user.teacherId) throw ApiError.forbidden("No teacher profile linked to your account");

  const today = todayIn(await zoneFor(req.user.instituteId));

  const sessionId = await readSessionId(req.instituteId);

  const teacher = await prisma.teacher.findUnique({
    where: { id: req.user.teacherId },
    include: {
      subjects: {
        include: {
          enrollments: {
            where: liveEnrolmentFilter(sessionId),
            include: { student: { select: { id: true, grade: true, section: true } } },
          },
        },
      },
      institute: { select: { id: true, name: true, logo: true, color: true } },
    },
  });

  if (!teacher) throw ApiError.notFound("Teacher profile not found");

  const studentIds = new Set();
  const classes = new Set();
  for (const subject of teacher.subjects) {
    for (const e of subject.enrollments) {
      studentIds.add(e.student.id);
      classes.add(`${e.student.grade}-${e.student.section}`);
    }
  }

  const [todayAttendance, recentAssessments, unreadMessages, notices, todaySlots] =
    await Promise.all([
      prisma.attendance.count({
        where: { studentId: { in: [...studentIds] }, date: today },
      }),
      prisma.assessment.findMany({
        where: { enrollment: { subject: { teacherId: teacher.id } } },
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          enrollment: {
            include: {
              student: { select: { id: true, name: true, rollNo: true } },
              subject: { select: { name: true, color: true } },
            },
          },
        },
      }),
      prisma.message.count({ where: { recipientId: req.user.id, isRead: false } }),
      prisma.notice.findMany({
        where: {
          instituteId: teacher.instituteId,
          OR: [{ audience: { isEmpty: true } }, { audience: { has: "TEACHER" } }],
        },
        take: 4,
        orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      }),
      prisma.timetableSlot.findMany({
        where: {
          teacherId: teacher.id,
          // Derived from the institute-local date, so a UTC host doesn't show
          // yesterday's timetable to an early-morning teacher.
          dayOfWeek: isoDayOfWeek(today),
        },
        include: { subject: { select: { name: true, color: true } } },
        orderBy: { period: "asc" },
      }),
    ]);

  const subjectStats = teacher.subjects.map((s) => ({
    id: s.id,
    name: s.name,
    grade: s.grade,
    color: s.color,
    students: s.enrollments.length,
    average: averageScore(s.enrollments),
  }));

  return ok(res, {
    teacher: {
      id: teacher.id,
      code: teacher.code,
      name: teacher.name,
      email: teacher.email,
      designation: teacher.designation,
      institute: teacher.institute,
    },
    kpis: {
      subjects: teacher.subjects.length,
      classes: classes.size,
      students: studentIds.size,
      attendanceMarkedToday: todayAttendance,
      attendancePendingToday: Math.max(0, studentIds.size - todayAttendance),
      unreadMessages,
      classAverage: subjectStats.length
        ? Number(
            (subjectStats.reduce((s, x) => s + x.average, 0) / subjectStats.length).toFixed(1)
          )
        : 0,
    },
    subjects: subjectStats,
    todaySchedule: todaySlots.map((s) => ({
      id: s.id,
      period: s.period,
      subject: s.subject.name,
      color: s.subject.color,
      grade: s.grade,
      section: s.section,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
    })),
    recentAssessments: recentAssessments.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      obtained: a.obtained,
      total: a.total,
      takenOn: a.takenOn,
      student: a.enrollment.student,
      subject: a.enrollment.subject,
    })),
    notices,
  });
});

/**
 * GET /api/dashboard/parent
 * Summary across all of the signed-in parent's children.
 */
export const parentDashboard = asyncHandler(async (req, res) => {
  const parentSessionId = await readSessionId(req.user.instituteId);
  /**
   * The school's own scale, not the platform's.
   *
   * Bands and the pass mark are set per school, but only the result card ever
   * asked — so a school that moved A+ to 80 saw it on the card and nowhere
   * else on this screen.
   */
  const grading = await policyFor(req.user.instituteId);
  if (!req.user.parentId) throw ApiError.forbidden("No parent profile linked to your account");

  const parent = await prisma.parent.findUnique({
    where: { id: req.user.parentId },
    include: {
      institute: { select: { id: true, name: true, logo: true, color: true, city: true } },
      students: {
        include: {
          enrollments: {
            where: sessionFilter(parentSessionId),
            include: { subject: { select: { name: true, color: true } } },
          },
          feeInvoices: { orderBy: { period: "desc" } },
          aiInsights: {
            include: { subject: { select: { name: true, color: true } } },
            orderBy: [{ severity: "desc" }, { generatedAt: "desc" }],
            take: 5,
          },
        },
      },
    },
  });

  if (!parent) throw ApiError.notFound("Parent profile not found");

  const children = await Promise.all(
    parent.students.map(async (s) => {
      const attendance = await prisma.attendance.findMany({
        where: { studentId: s.id },
        orderBy: { date: "desc" },
        take: 60,
        select: { status: true, date: true },
      });

      const outstanding = s.feeInvoices
        .filter((f) => f.status === "PENDING" || f.status === "OVERDUE")
        .reduce((sum, f) => sum + (f.amount - f.discount + f.lateFee), 0);

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        grade: s.grade,
        section: s.section,
        rollNo: s.rollNo,
        photoUrl: s.photoUrl,
        gpa: grading.gpa(s.enrollments),
        average: averageScore(s.enrollments),
        subjects: s.enrollments.map((e) => ({
          name: e.subject.name,
          color: e.subject.color,
          score: e.currentScore,
          previousScore: e.previousScore,
          // The live policy, not the letter cached when this was last marked.
          grade: grading.letterGrade(e.currentScore),
          predicted: e.predictedScore,
        })),
        attendance: attendanceSummary(attendance),
        fees: {
          outstanding,
          nextDue: s.feeInvoices.find((f) => f.status === "PENDING" || f.status === "OVERDUE") ?? null,
          history: s.feeInvoices.slice(0, 6),
        },
        insights: s.aiInsights,
      };
    })
  );

  const [unreadMessages, notices] = await Promise.all([
    prisma.message.count({ where: { recipientId: req.user.id, isRead: false } }),
    prisma.notice.findMany({
      where: {
        instituteId: parent.instituteId,
        OR: [{ audience: { isEmpty: true } }, { audience: { has: "PARENT" } }],
      },
      take: 5,
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    }),
  ]);

  return ok(res, {
    parent: {
      id: parent.id,
      code: parent.code,
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      relation: parent.relation,
      institute: parent.institute,
    },
    kpis: {
      children: children.length,
      unreadMessages,
      totalOutstanding: children.reduce((s, c) => s + c.fees.outstanding, 0),
      averageAttendance: children.length
        ? Number(
            (children.reduce((s, c) => s + c.attendance.rate, 0) / children.length).toFixed(1)
          )
        : 0,
    },
    children,
    notices,
  });
});

/**
 * GET /api/reports/institute
 * Consolidated institute report — the "Reports" tab and export source.
 */
export const instituteReport = asyncHandler(async (req, res) => {
  const instituteId = req.instituteId;
  if (!instituteId) throw ApiError.badRequest("instituteId is required");

  // Academic figures are about one year; the date range below narrows the
  // attendance and fee history within it.
  const reportSessionId = await readSessionId(instituteId);
  /**
   * The school's own scale, not the platform's.
   *
   * Bands and the pass mark are set per school, but only the result card ever
   * asked — so a school that moved A+ to 80 saw it on the card and nowhere
   * else on this screen.
   */
  const grading = await policyFor(instituteId);

  const { from, to } = req.query;
  const dateFilter =
    from || to
      ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }
      : {};

  const [institute, students, attendance, feeRows, subjects] = await Promise.all([
    prisma.institute.findUnique({ where: { id: instituteId }, include: { plan: { select: PLAN_PUBLIC } } }),
    prisma.student.findMany({
      where: { instituteId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        grade: true,
        section: true,
        rollNo: true,
        enrollments: { where: sessionFilter(reportSessionId), select: { currentScore: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { instituteId, ...dateFilter },
      select: { status: true, studentId: true },
    }),
    prisma.feeInvoice.groupBy({
      by: ["status"],
      where: { instituteId },
      _sum: { amount: true, paidAmount: true },
      _count: true,
    }),
    prisma.subject.findMany({
      where: { instituteId },
      include: {
        teacher: { select: { name: true } },
        enrollments: { where: sessionFilter(reportSessionId), select: { currentScore: true } },
      },
    }),
  ]);

  if (!institute) throw ApiError.notFound("Institute not found");

  const perStudentAttendance = new Map();
  for (const a of attendance) {
    if (!perStudentAttendance.has(a.studentId)) perStudentAttendance.set(a.studentId, []);
    perStudentAttendance.get(a.studentId).push(a);
  }

  const roster = students
    .map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      section: s.section,
      rollNo: s.rollNo,
      average: averageScore(s.enrollments),
      gpa: grading.gpa(s.enrollments),
      attendanceRate: attendanceSummary(perStudentAttendance.get(s.id) || []).rate,
    }))
    .sort((a, b) => b.average - a.average);

  return ok(res, {
    generatedAt: new Date(),
    institute: {
      id: institute.id,
      code: institute.code,
      name: institute.name,
      city: institute.city,
      plan: institute.plan.name,
    },
    period: { from: from ?? null, to: to ?? null },
    summary: {
      activeStudents: students.length,
      overallAverage: roster.length
        ? Number((roster.reduce((s, r) => s + r.average, 0) / roster.length).toFixed(1))
        : 0,
      attendanceRate: attendanceSummary(attendance).rate,
      feesCollected: feeRows
        .filter((r) => r.status === "PAID")
        .reduce((s, r) => s + (r._sum.paidAmount ?? r._sum.amount ?? 0), 0),
      feesOutstanding: feeRows
        .filter((r) => r.status === "PENDING" || r.status === "OVERDUE")
        .reduce((s, r) => s + (r._sum.amount ?? 0), 0),
    },
    subjectPerformance: subjects
      .map((s) => ({
        id: s.id,
        name: s.name,
        grade: s.grade,
        teacher: s.teacher?.name ?? "Unassigned",
        students: s.enrollments.length,
        average: averageScore(s.enrollments),
      }))
      .sort((a, b) => b.average - a.average),
    roster,
  });
});

