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

/**
 * Relative time the message list shows: "2h ago", "3d ago".
 *
 * `tr` is how the parent portal gets these in Urdu. It defaults to identity,
 * so every other caller — and this adapter itself — keeps returning English
 * without knowing a translation exists. Formatting once and translating the
 * result would mean parsing "12d ago" back apart; the units are named here
 * instead, and whoever knows the language supplies the words.
 */
export const timeAgo = (value, tr = (s) => s) => {
  if (!value) return "";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return tr("just now");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return tr("{n}m ago").replace("{n}", minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr("{n}h ago").replace("{n}", hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return tr("{n}d ago").replace("{n}", days);
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
    phone: user.phone ?? null,
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
  const empty = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
  if (!summary || !summary.total) {
    return { present: 0, absent: 0, late: 0, leave: 0, total: 0, days: 0, rate: 0, counts: empty };
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
    // Raw day counts, kept alongside the percentages. The parent portal shows
    // both, and used to print a hard-coded 87/8/5/2 row because only the
    // percentages survived this mapping.
    counts: {
      present: summary.present ?? 0,
      absent: summary.absent ?? 0,
      late: summary.late ?? 0,
      leave: summary.leave ?? 0,
      total: summary.total,
    },
  };
};

const DAY_ABBR = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

export const toLegacyWeek = (week = []) =>
  week.map((w) => ({
    d: w.day || DAY_ABBR[new Date(w.date).getDay()],
    s: (w.status || "present").toLowerCase(),
  }));

/**
 * Drives the monthly attendance bars.
 *
 * The API returns the last 12 months ending with the current one, so the
 * label has to come from each row's own `month` key — the chart used to index
 * a fixed Jan…Dec array, which mislabelled every bar whenever the school year
 * didn't happen to start in January.
 */
export const toLegacyMonthly = (monthly = []) =>
  monthly.map((m) => {
    const [year, month] = (m.month ?? "").split("-");
    return {
      present: m.present ?? 0,
      total: m.total ?? 0,
      label: MONTHS[Number(month) - 1] ?? "",
      year,
    };
  });

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
    // Kept alongside `amt` so a breakdown can say why the payable differs from
    // the heads it lists, instead of quietly showing two totals.
    discount: f.discount ?? 0,
    lateFee: f.lateFee ?? 0,
    // Part payment is normal here, so a guardian needs to see what has been
    // received against this challan and what is still due — not just its total.
    paid: f.paidAmount ?? 0,
    balance: f.balance ?? Math.max(0, (f.amount - (f.discount ?? 0) + (f.lateFee ?? 0)) - (f.paidAmount ?? 0)),
    // What the challan is made of. Empty for anything raised before fee heads
    // existed, and for a school that bills a single flat amount — both of which
    // stay perfectly valid, so the UI shows a breakdown only when there is one.
    items: (f.items ?? []).map((i) => ({
      head: i.head,
      label: i.label ?? null,
      amount: i.amount,
    })),
  }));
};

// ─────────────────────────── academics ───────────────────────────

export const toLegacySubjects = (subjects = []) =>
  subjects.map((s) => ({
    id: s.subjectId ?? s.id,
    // The enrolment row, which is what score edits are written against.
    enrollmentId: s.enrollmentId ?? null,
    name: s.name,
    /**
     * Whether a score exists at all, kept apart from the number.
     *
     * `score` stays numeric because bars and arithmetic all over the portals
     * depend on it. But a subject nobody has marked has no score, and the
     * zero standing in for it reads as though the child scored nothing —
     * which is a different and much worse claim. Since subject scores became
     * derived from marks, a fresh enrolment starts unmarked, so this is the
     * ordinary case rather than a rare one.
     */
    scored: s.score !== null && s.score !== undefined,
    score: s.score ?? 0,
    prev: s.previousScore ?? s.score ?? 0,
    grade: s.grade ?? "—",
    teacher: s.teacher ?? "Unassigned",
    // Identity, not the display name — two staff can share a name, and the
    // teacher portal filters its roster on this.
    teacherId: s.teacherId ?? null,
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

/**
 * Normalises either timetable shape into flat slots.
 *
 * `GET /timetable` returns day-groups (`{ day, periods: [...] }`), but the
 * student record returns one flat array of slots. The adapter only understood
 * the first, so `s.timetable?.days` was always undefined on a student and the
 * parent portal's timetable rendered an empty grid despite the data being there.
 */
const timetableSlots = (input) => {
  if (!input) return [];
  const groups = Array.isArray(input) ? null : input.days;
  if (groups) {
    return groups.flatMap((d) =>
      (d.periods || []).map((p) => ({
        dayOfWeek: d.dayOfWeek,
        day: d.day,
        period: p.period,
        subject: p.subject,
        startTime: p.startTime,
        endTime: p.endTime,
      }))
    );
  }
  return (Array.isArray(input) ? input : []).map((s) => ({
    dayOfWeek: s.dayOfWeek,
    day: s.day,
    period: s.period,
    // A flat slot carries the whole subject object; a grouped one just a name.
    subject: typeof s.subject === "string" ? s.subject : s.subject?.name,
    startTime: s.startTime,
    endTime: s.endTime,
  }));
};

/** → [{ day: "Monday", p: ["Maths", "English", …] }], ordered by period. */
export const toLegacyTimetable = (input) => {
  const slots = timetableSlots(input);
  const byDay = new Map();
  for (const s of slots) {
    const key = s.dayOfWeek ?? DAY_NAMES.indexOf(s.day);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(s);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayOfWeek, rows]) => ({
      day: rows[0].day || DAY_NAMES[dayOfWeek % 7],
      p: [...rows].sort((a, b) => a.period - b.period).map((r) => r.subject),
    }));
};

/**
 * Column headers for the timetable grid, taken from the real slot times —
 * the parent portal used to print a fixed "8:00–8:40 …" row that matched
 * nothing in the database.
 */
export const toLegacyPeriods = (input) => {
  const slots = timetableSlots(input);
  const byPeriod = new Map();
  for (const s of slots) {
    if (!byPeriod.has(s.period)) {
      byPeriod.set(s.period, {
        period: s.period,
        label: s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : `Period ${s.period}`,
      });
    }
  }
  return [...byPeriod.values()].sort((a, b) => a.period - b.period);
};

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
/** Has anyone marked this child in any subject yet? */
const hasAnyMark = (s) =>
  (s?.subjects ?? []).some((x) => x.score !== null && x.score !== undefined);

/**
 * Nothing to judge is not the same as nothing wrong.
 *
 * The score began at 100 and deducted for each concern, so a child with no
 * marks at all had no concerns and scored 100 — the parent portal told a
 * guardian their unmarked child was "Excellent" while the rank beside it
 * honestly said "No marks recorded yet". Absence of evidence is reported as
 * absence here too.
 */
export const aiScoreFrom = (insights = [], hasMarks = true) => {
  if (!hasMarks) return null;
  const penalty = insights.reduce((sum, i) => {
    if (i.type === "STRENGTH" || i.type === "PREDICTION") return sum;
    if (i.severity >= 3) return sum + 10;
    if (i.severity === 2) return sum + 5;
    return sum;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
};

export const aiScoreLabel = (score) =>
  score === null || score === undefined
    ? "No marks recorded yet"
    : score >= 90 ? "Excellent" : score >= 75 ? "On track" : score >= 60 ? "Needs support" : "At risk";

// ─────────────────────────── people ───────────────────────────

/** Student as it appears in list views (admin tables, teacher rosters). */
export const toLegacyStudentSummary = (s) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  status: (s.status || "active").toLowerCase(),
  grade: s.grade,
  section: s.section,
  roll: s.rollNo,
  instId: s.institute?.id ?? s.instituteId ?? null,
  // Null for a school with one campus, which is most of them.
  branch: s.branch ? { id: s.branch.id, name: s.branch.name, code: s.branch.code } : null,
  parentId: s.parent?.id ?? s.parentId ?? null,
  parentName: s.parent?.name ?? null,
  phone: s.phone,
  address: s.address,
  dob: isoDate(s.dob),
  blood: s.bloodGroup,

  /**
   * `null` means no position, and it has to survive the mapping.
   *
   * Coercing it to 0 turned an honest blank into a rank of zero, which the
   * screens then printed as "Rank #0". The API says null when a child has
   * nothing marked; every render site now checks for it.
   */
  rank: s.rank ?? null,
  classSize: s.classSize ?? 0,
  // `score` is the headline bar the portals plot — the strongest subject.
  score: Math.round(s.topScore ?? s.average ?? 0),
  // `average` is the mean across all subjects, used for ranking students.
  average: Math.round(s.average ?? 0),
  color: s.topSubjectColor || "#2D6A4F",

  att: toLegacyAttendance(s.attendance),
  weekAtt: toLegacyWeek(s.weekAttendance),
  /**
   * What this child still owes, as a number the roster can badge on.
   *
   * The roster used to ask `fees.some(f => f.status === "pending")`, which
   * forced the list endpoint to carry twelve full invoices per student — and
   * it still answered wrongly, because an OVERDUE challan is not "pending",
   * so a defaulter's row read "Paid". The server already totals PENDING +
   * OVERDUE balances, so the roster reads that and the invoices stay where
   * they are actually needed: on the detail record.
   */
  dues: s.duesOutstanding ?? 0,
  // Empty on a list row by design — toLegacyStudentFull fills it from detail.
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
  // The server already totals these; the parent fee page used to multiply an
  // invoice count by a hard-coded 12,500 instead of reading them.
  feeTotals: {
    paid: s.fees?.paid ?? 0,
    outstanding: s.fees?.outstanding ?? 0,
  },
  timetable: toLegacyTimetable(s.timetable ?? s.timetableDays),
  timetablePeriods: toLegacyPeriods(s.timetable ?? s.timetableDays),
  aiRecs: toLegacyInsights(s.aiInsights),
  // A subject nobody has marked cannot say anything about the child.
  aiScore: aiScoreFrom(s.aiInsights, hasAnyMark(s)),
  aiScoreLabel: aiScoreLabel(aiScoreFrom(s.aiInsights, hasAnyMark(s))),
  /**
   * `null` means no position, and it has to survive the mapping.
   *
   * Coercing it to 0 turned an honest blank into a rank of zero, which the
   * screens then printed as "Rank #0". The API says null when a child has
   * nothing marked; every render site now checks for it.
   */
  rank: s.rank ?? null,
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
  branch: t.branch ? { id: t.branch.id, name: t.branch.name, code: t.branch.code } : null,
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
  /**
   * The first child, kept only for callers that have not been taught about
   * siblings yet. A guardian with three children in the school is the
   * commonest family a Pakistani school has, and reading `studentId` shows
   * one of them and hides the rest.
   */
  studentId: p.students?.[0]?.id ?? null,
  studentIds: (p.students ?? []).map((s) => s.id),
  /** Every child, with enough to name them on a screen. */
  children: (p.students ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    grade: s.grade ?? null,
    section: s.section ?? null,
    roll: s.rollNo ?? null,
  })),
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
  // Kept raw as well: the parent portal re-formats it in Urdu.
  at: m.createdAt,
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
  // Who posted it, so a teacher's board can offer Edit on their own notices
  // only. The backend refuses the rest either way.
  authorId: n.createdBy?.id ?? null,
});
