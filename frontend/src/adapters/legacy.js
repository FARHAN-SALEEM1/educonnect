/**
 * Translates API responses into the object shapes the portal components
 * were originally written against.
 *
 * Why an adapter instead of rewriting the UI: the portals are ~3,000 lines
 * of presentation code that already work. Mapping at the boundary keeps
 * that code untouched, so the only thing that changed when the backend
 * arrived is where the data comes from.
 *
 * Legacy conventions this layer preserves:
 *   • role and status strings are lowercase ("admin", "active", "present")
 *   • attendance counts are PERCENTAGES, not raw day counts
 *   • dates are pre-formatted display strings ("Mar 12", "2h ago")
 */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** "2026-03-12T…" → "Mar 12" */
export const shortDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

/** "2026-03-12T…" → "2026-03-12" */
export const isoDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/** Relative time the message list shows: "2h ago", "3d ago". */
export const timeAgo = (value) => {
  if (!value) return "";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(value);
};

// ─────────────────────────── identity ───────────────────────────

export const toLegacyUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.toLowerCase(),
    inst: user.instituteId ?? null,
    // The portals use `ref` to find the teacher/parent profile behind a login.
    ref: user.teacherId ?? user.parentId ?? null,
    avatarUrl: user.avatarUrl ?? null,
    institute: user.institute ?? null,
  };
};

export const toLegacyInstitute = (institute) => {
  if (!institute) return null;
  return {
    id: institute.id,
    code: institute.code,
    name: institute.name,
    city: institute.city,
    email: institute.email,
    phone: institute.phone,
    logo: institute.logo || "🏫",
    color: institute.color,
    plan: typeof institute.plan === "object" ? institute.plan?.id : institute.plan,
    planName: typeof institute.plan === "object" ? institute.plan?.name : undefined,
    planPrice: typeof institute.plan === "object" ? institute.plan?.price : undefined,
    status: (institute.status || "").toLowerCase(),
    joined: isoDate(institute.joinedAt),
    defaultMonthlyFee: institute.defaultMonthlyFee ?? 0,
    students: institute.students ?? institute.counts?.students ?? 0,
    teachers: institute.teachers ?? institute.counts?.teachers ?? 0,
  };
};

// ───────────────────────── attendance ─────────────────────────

/**
 * The API returns raw day counts; the UI renders percentages
 * (`${att.present}%`, donut fills, bar widths). Convert once, here.
 */
export const toLegacyAttendance = (summary) => {
  if (!summary || !summary.total) {
    return { present: 0, absent: 0, late: 0, leave: 0, total: 0, days: 0, rate: 0 };
  }
  const pct = (n) => Math.round(((n ?? 0) / summary.total) * 100);
  return {
    // Each bucket is its own share of the total, so the donut legend adds up
    // to 100. `rate` is the separate present-or-late figure.
    present: pct(summary.present),
    absent: pct(summary.absent),
    late: pct(summary.late),
    leave: pct(summary.leave),
    total: 100,
    days: summary.total, // real school-day count
    rate: Math.round(summary.rate ?? 0),
  };
};

const DAY_ABBR = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

export const toLegacyWeek = (week = []) =>
  week.map((w) => ({
    d: w.day || DAY_ABBR[new Date(w.date).getDay()],
    s: (w.status || "present").toLowerCase(),
  }));

/** monthlyAtt is a plain number-per-month array driving the bar chart. */
export const toLegacyMonthly = (monthly = []) => monthly.map((m) => m.present ?? 0);

// ─────────────────────────── finance ───────────────────────────

/**
 * Accepts either a plain invoice array (list endpoints) or the
 * `{ paid, outstanding, invoices }` object the full student payload returns.
 */
export const toLegacyFees = (input = []) => {
  const invoices = Array.isArray(input) ? input : (input?.invoices ?? []);
  return invoices.map((f) => ({
    id: f.id,
    month: f.title,
    amt: f.amount - (f.discount ?? 0) + (f.lateFee ?? 0),
    status: (f.status || "").toLowerCase(),
    date: f.paidAt ? shortDate(f.paidAt) : null,
    dueDate: shortDate(f.dueDate),
    method: f.method ?? null,
  }));
};

// ─────────────────────────── academics ───────────────────────────

export const toLegacySubjects = (subjects = []) =>
  subjects.map((s) => ({
    id: s.subjectId ?? s.id,
    name: s.name,
    score: s.score ?? 0,
    prev: s.previousScore ?? s.score ?? 0,
    grade: s.grade ?? "—",
    teacher: s.teacher ?? "Unassigned",
    color: s.color || "#2D6A4F",
    pred: s.predicted ?? s.score ?? 0,
  }));

export const toLegacyAssessments = (assessments = []) =>
  assessments.map((a) => ({
    id: a.id,
    sub: a.subject ?? a.subjectName ?? "—",
    type: a.title ?? a.type,
    got: a.obtained,
    of: a.total,
    date: shortDate(a.takenOn),
  }));

/** API day-groups → [{ day: "Monday", p: ["Maths", "English", …] }] */
export const toLegacyTimetable = (days = []) =>
  days.map((d) => ({
    day: d.day || DAY_NAMES[d.dayOfWeek % 7],
    p: [...(d.periods || [])]
      .sort((a, b) => a.period - b.period)
      .map((p) => p.subject),
  }));

export const toLegacyInsights = (insights = []) =>
  insights.map((i) => ({
    id: i.id,
    sub: i.subject?.name ?? "General",
    tip: i.message,
    type: i.type,
    severity: i.severity,
  }));

/**
 * A single headline number for the "AI Score" tile.
 *
 * Starts at 100 and deducts for each concern the insight engine raised:
 * 10 per action-level finding (severity 3), 5 per watch-level (severity 2).
 * Informational and positive findings cost nothing. Deterministic and
 * explainable — you can point at the exact insights that produced it.
 */
export const aiScoreFrom = (insights = []) => {
  const penalty = insights.reduce((sum, i) => {
    if (i.type === "STRENGTH" || i.type === "PREDICTION") return sum;
    if (i.severity >= 3) return sum + 10;
    if (i.severity === 2) return sum + 5;
    return sum;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
};

export const aiScoreLabel = (score) =>
  score >= 90 ? "Excellent" : score >= 75 ? "On track" : score >= 60 ? "Needs support" : "At risk";

// ─────────────────────────── people ───────────────────────────

/** Student as it appears in list views (admin tables, teacher rosters). */
export const toLegacyStudentSummary = (s) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  grade: s.grade,
  section: s.section,
  roll: s.rollNo,
  instId: s.institute?.id ?? s.instituteId ?? null,
  parentId: s.parent?.id ?? s.parentId ?? null,
  parentName: s.parent?.name ?? null,
  phone: s.phone,
  address: s.address,
  dob: isoDate(s.dob),
  blood: s.bloodGroup,

  gpa: s.gpa ?? 0,
  rank: s.rank ?? 0,
  classSize: s.classSize ?? 0,
  // `score` is the headline bar the portals plot — the strongest subject.
  score: Math.round(s.topScore ?? s.average ?? 0),
  // `average` is the mean across all subjects, used for ranking students.
  average: Math.round(s.average ?? 0),
  color: s.topSubjectColor || "#2D6A4F",

  att: toLegacyAttendance(s.attendance),
  weekAtt: toLegacyWeek(s.weekAttendance),
  fees: toLegacyFees(s.fees),
  subjects: toLegacySubjects(s.subjects),
});

/** Student as the parent portal needs it — every tab's data in one object. */
export const toLegacyStudentFull = (s) => ({
  ...toLegacyStudentSummary(s),
  instId: s.institute?.id ?? null,
  subjects: toLegacySubjects(s.subjects),
  assessments: toLegacyAssessments(s.recentAssessments),
  att: toLegacyAttendance(s.attendance),
  weekAtt: toLegacyWeek(s.attendance?.week),
  monthlyAtt: toLegacyMonthly(s.attendance?.monthly),
  fees: toLegacyFees(s.fees?.invoices),
  timetable: toLegacyTimetable(s.timetable?.days ?? s.timetableDays),
  aiRecs: toLegacyInsights(s.aiInsights),
  aiScore: aiScoreFrom(s.aiInsights),
  aiScoreLabel: aiScoreLabel(aiScoreFrom(s.aiInsights)),
  gpa: s.gpa ?? 0,
  rank: s.rank ?? 0,
  classSize: s.classSize ?? 0,
});

export const toLegacyTeacher = (t) => ({
  id: t.id,
  code: t.code,
  name: t.name,
  email: t.email,
  phone: t.phone,
  subject: t.subject ?? t.subjects?.[0]?.name ?? "—",
  subjects: t.subjects ?? [],
  instId: t.institute?.id ?? t.instituteId ?? null,
  classes: t.classes ?? [],
  students: t.students ?? 0,
  status: t.isActive === false ? "inactive" : "active",
  userId: t.user?.id ?? t.userId ?? null,
});

export const toLegacyParent = (p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  email: p.email,
  phone: p.phone,
  rel: p.relation ?? "Guardian",
  instId: p.institute?.id ?? p.instituteId ?? null,
  studentId: p.students?.[0]?.id ?? null,
  studentIds: (p.students ?? []).map((s) => s.id),
  userId: p.user?.id ?? p.userId ?? null,
});

// ──────────────────────── communication ────────────────────────

export const toLegacyMessage = (m, currentUserId) => ({
  id: m.id,
  from: m.sender?.name ?? "—",
  fromRole: m.fromRole ?? m.sender?.role ?? "",
  fromId: m.sender?.id ?? null,
  to: m.recipient?.name ?? "—",
  toId: m.recipient?.id ?? null,
  subj: m.subject,
  body: m.body,
  time: timeAgo(m.createdAt),
  // "unread" only means anything for messages addressed to you.
  unread: m.recipient?.id === currentUserId ? !m.isRead : false,
  instId: m.instituteId,
  studentId: m.student?.id ?? null,
  replies: (m.replies ?? []).map((r) => toLegacyMessage(r, currentUserId)),
});

export const toLegacyNotice = (n) => ({
  id: n.id,
  title: n.title,
  body: n.body,
  cat: n.category
    ? n.category.charAt(0) + n.category.slice(1).toLowerCase()
    : "General",
  date: shortDate(n.publishedAt),
  instId: n.instituteId,
  pinned: n.isPinned,
  author: n.createdBy?.name ?? null,
});
