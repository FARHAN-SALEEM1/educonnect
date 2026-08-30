import { prisma, prismaRaw } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { nextInstituteCode } from "../utils/codes.js";
import crypto from "node:crypto";
import { hashPassword } from "../utils/password.js";
import { sendWelcome, notSent, undeliveredReason } from "../services/email.service.js";
import { audit } from "../utils/audit.js";
import { periodKey } from "../utils/academics.js";
import { PLAN_PUBLIC, withoutProviderIds } from "../utils/publicFields.js";
import {
  effectiveStudentLimit,
  endOfCurrentPeriod,
  hasTrialExpired,
  subscriptionSummary,
} from "../utils/subscription.js";
import { getSetting } from "./platform.controller.js";
import { DEFAULT_BANDS, DEFAULT_PASSING, gradingPolicy } from "../utils/grading.js";
import {
  createTerm,
  deleteTerm,
  ensureTerms,
  reorderTerms,
  scoresBuiltOnOldWeighting,
  updateTerm,
  weightingIsComplete,
} from "../services/term.service.js";
import {
  defaultSpan,
  ensureCurrentSession,
  listSessions,
  moveToSession,
  nextSessionName,
  reviseSessionDates,
} from "../services/session.service.js";
import {
  NOTIFICATION_PREFS,
  notificationSettings,
  sanitizeNotificationSettings,
} from "../utils/notifications.js";

/**
 * GET /api/plans — public, powers the pricing section on the landing page.
 *
 * Explicitly selected, not `include`d. This is the only plan endpoint that
 * needs no token at all, and a bare findMany returned every column — so
 * `providerPriceIds`, the gateway's own plan tokens, were being served to
 * anonymous callers from the pricing table. PLAN_PUBLIC was already used
 * everywhere a plan is nested inside another response; it was missing from the
 * one place that returns plans on their own.
 */
export const listPlans = asyncHandler(async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
    select: { ...PLAN_PUBLIC, _count: { select: { institutes: true } } },
  });
  return ok(
    res,
    plans.map((p) => ({ ...p, instituteCount: p._count.institutes, _count: undefined }))
  );
});

/** GET /api/institutes — super admin only. */
export const listInstitutes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, status, planId, city } = req.query;

  const where = {
    ...(status && { status }),
    ...(planId && { planId }),
    ...(city && { city: { contains: city, mode: "insensitive" } }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [total, institutes] = await Promise.all([
    prisma.institute.count({ where }),
    prisma.institute.findMany({
      where,
      skip,
      take: limit,
      orderBy: { joinedAt: "desc" },
      include: {
        plan: { select: PLAN_PUBLIC },
        _count: { select: { students: { where: { deletedAt: null } }, teachers: { where: { deletedAt: null } }, parents: { where: { deletedAt: null } }, users: true } },
      },
    }),
  ]);

  const data = institutes.map((i) => ({
    ...withoutProviderIds(i),
    students: i._count.students,
    teachers: i._count.teachers,
    parents: i._count.parents,
    users: i._count.users,
    seatsUsed: i._count.students,
    seatsLimit: effectiveStudentLimit(i),
    studentLimit: i.studentLimit,
    cancelAtPeriodEnd: i.cancelAtPeriodEnd,
    subscriptionEndsAt: i.subscriptionEndsAt,
    _count: undefined,
  }));

  return ok(res, data, "Institutes fetched", pageMeta(total, page, limit));
});

/** GET /api/institutes/:id */
export const getInstitute = asyncHandler(async (req, res) => {
  // Admins may read their own institute; super admins may read any.
  if (req.user.role !== "SUPERADMIN" && req.user.instituteId !== req.params.id) {
    throw ApiError.forbidden("You can only view your own institute");
  }

  const institute = await prisma.institute.findUnique({
    where: { id: req.params.id },
    include: {
      plan: { select: PLAN_PUBLIC },
      _count: { select: { students: { where: { deletedAt: null } }, teachers: { where: { deletedAt: null } }, parents: { where: { deletedAt: null } }, subjects: true } },
      subscriptionInvoices: { orderBy: { period: "desc" }, take: 12 },
    },
  });

  if (!institute) throw ApiError.notFound("Institute not found");

  return ok(res, {
    ...withoutProviderIds(institute),
    counts: institute._count,
    _count: undefined,
  });
});

/** POST /api/institutes — super admin creates an institute directly. */
/**
 * POST /api/institutes — the platform owner onboards a school.
 *
 * This used to create the institute and its first subscription invoice and stop
 * there: no admin user, no password, no email — while the button calling it
 * read "Create & Send Credentials". The school went live with nobody able to
 * sign in, and nothing said so.
 *
 * The admin account is now created with the school, in the same transaction, so
 * the two cannot come apart. Sign-in details are emailed; when there is no mail
 * server the temporary password comes back in the response instead, because an
 * account whose password was never delivered is the same as no account at all.
 */
export const createInstitute = asyncHandler(async (req, res) => {
  const { adminName, adminEmail, adminPassword, ...data } = req.body;

  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
  if (!plan) throw ApiError.badRequest("Selected plan does not exist");

  const clash = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (clash) throw ApiError.conflict("A user with this email already exists");

  const code = await nextInstituteCode();
  const tempPassword = adminPassword || `EC-${crypto.randomBytes(4).toString("hex")}`;
  const passwordHash = await hashPassword(tempPassword);

  const institute = await prisma.$transaction(async (tx) => {
    const record = await tx.institute.create({
      data: { ...data, code, status: data.status ?? "ACTIVE" },
      include: { plan: { select: PLAN_PUBLIC } },
    });

    await tx.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        phone: data.phone ?? null,
        passwordHash,
        role: "ADMIN",
        instituteId: record.id,
      },
    });

    await tx.subscriptionInvoice.create({
      data: {
        instituteId: record.id,
        planId: plan.id,
        period: periodKey(),
        amount: plan.price,
        status: "PENDING",
      },
    });

    // The school's first academic year, created with the school — so no later
    // read ever has to create one.
    const span = defaultSpan(record.currentSession, 4);
    if (span) {
      await tx.academicSession.create({
        data: { instituteId: record.id, name: record.currentSession, ...span, isCurrent: true },
      });
    }

    return record;
  });

  audit(req, { action: "institute.create", entity: "Institute", entityId: institute.id });

  /**
   * Sent unconditionally, unlike a teacher's welcome mail.
   *
   * The "Welcome emails" preference belongs to a school and governs the staff
   * it creates. This mail is the platform handing a brand-new school its own
   * way in, and the school has no one yet to have set a preference.
   */
  const delivery = adminPassword
    ? notSent("not-applicable")
    : await sendWelcome({
        to: adminEmail,
        name: adminName,
        role: "admin",
        instituteName: institute.name,
        tempPassword,
        loginUrl: `${env.appUrl}/`,
      });

  return created(
    res,
    { ...withoutProviderIds(institute), adminEmail, emailed: delivery.delivered },
    adminPassword
      ? `${institute.name} created with the password you set for ${adminEmail}.`
      : delivery.delivered
        ? `${institute.name} created — sign-in details sent to ${adminEmail}.`
        : `${institute.name} created. Admin ${adminEmail}, temporary password: ${tempPassword} (${undeliveredReason(delivery.reason)}).`
  );
});

/** PATCH /api/institutes/:id */
export const updateInstitute = asyncHandler(async (req, res) => {
  if (req.user.role !== "SUPERADMIN") {
    if (req.user.instituteId !== req.params.id) {
      throw ApiError.forbidden("You can only update your own institute");
    }
    // An institute admin must not be able to upgrade its own plan or
    // un-suspend itself — those are platform-level decisions.
    delete req.body.planId;
    delete req.body.status;
  }

  const institute = await prisma.institute.update({
    where: { id: req.params.id },
    data: req.body,
    include: { plan: { select: PLAN_PUBLIC } },
  });

  audit(req, { action: "institute.update", entity: "Institute", entityId: institute.id });
  return ok(res, withoutProviderIds(institute), "Institute updated");
});

/** PATCH /api/institutes/:id/plan — super admin changes subscription tier. */
export const changePlan = asyncHandler(async (req, res) => {
  const { planId } = req.body;

  const [institute, plan] = await Promise.all([
    prisma.institute.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { students: { where: { deletedAt: null } } } } },
    }),
    prisma.plan.findUnique({ where: { id: planId } }),
  ]);

  if (!institute) throw ApiError.notFound("Institute not found");
  if (!plan) throw ApiError.badRequest("Plan does not exist");

  // Refuse a downgrade that would put the institute over its new seat cap.
  if (institute._count.students > plan.maxStudents) {
    throw ApiError.badRequest(
      `Cannot switch to ${plan.name}: the institute has ${institute._count.students} students but the plan allows ${plan.maxStudents}.`
    );
  }

  const updated = await prisma.institute.update({
    where: { id: req.params.id },
    data: { planId },
    include: { plan: { select: PLAN_PUBLIC } },
  });

  audit(req, {
    action: "institute.change_plan",
    entity: "Institute",
    entityId: updated.id,
    meta: { from: institute.planId, to: planId },
  });

  return ok(res, withoutProviderIds(updated), `Plan changed to ${plan.name}`);
});

/** PATCH /api/institutes/:id/status — activate / suspend. */
export const changeStatus = asyncHandler(async (req, res) => {
  const target = req.body.status;

  const existing = await prisma.institute.findUnique({
    where: { id: req.params.id },
    select: { status: true, trialEndsAt: true },
  });
  if (!existing) throw ApiError.notFound("Institute not found");

  /**
   * Approval starts the trial clock.
   *
   * Signup sets `trialEndsAt` at the moment of registration, but a signup now
   * sits locked in PENDING until a super admin approves it. Left alone, the
   * trial would tick away during that wait and an institute approved after
   * the window closed would be locked out the instant it was let in. Starting
   * the clock here means every school gets its full trial from the day it can
   * actually use the product.
   *
   * Re-activating an institute whose trial already lapsed also restarts it —
   * this is the only lever the platform owner has to restore access until
   * real billing exists. Un-suspending a school mid-trial leaves its
   * remaining days untouched.
   */
  const startsTrial =
    target === "ACTIVE" &&
    (existing.status === "PENDING" || hasTrialExpired(existing));

  const trialDays = startsTrial ? Number(await getSetting("trialDays")) || 14 : 0;

  const institute = await prisma.institute.update({
    where: { id: req.params.id },
    data: {
      status: target,
      ...(startsTrial && {
        trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
      }),
    },
    include: { plan: { select: PLAN_PUBLIC } },
  });

  audit(req, {
    action: "institute.change_status",
    entity: "Institute",
    entityId: institute.id,
    meta: { status: req.body.status },
  });

  return ok(res, withoutProviderIds(institute), `Institute is now ${req.body.status.toLowerCase()}`);
});

/** GET /api/institutes/me/notifications */
export const getNotificationSettings = asyncHandler(async (req, res) => {
  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { notificationSettings: true },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  const values = notificationSettings(institute);
  return ok(
    res,
    NOTIFICATION_PREFS.map((p) => ({
      key: p.key,
      label: p.label,
      description: p.description,
      controls: p.controls,
      enabled: values[p.key],
    }))
  );
});

/** PATCH /api/institutes/me/notifications — body is { key: boolean, … } */
/**
 * GET /api/institutes/me/session — the session the school is running.
 *
 * Also reports how many students sit in each class right now, because the
 * screen that rolls a session over needs to know what it is about to move.
 */
export const getSession = asyncHandler(async (req, res) => {
  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { currentSession: true },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  /**
   * Created on first ask rather than at signup.
   *
   * Every institute that existed before sessions had dates still has a name
   * for its year, so the row can be reconstructed from what the school has
   * been calling it. That is a fair derivation — it names the session the
   * school named. Nothing here guesses which session a past mark belonged to.
   */
  const current = await ensureCurrentSession(req.instituteId);
  const sessions = await listSessions(req.instituteId);

  const classes = await prisma.student.groupBy({
    by: ["grade", "section"],
    where: { instituteId: req.instituteId, status: "ACTIVE", deletedAt: null },
    _count: { _all: true },
  });

  const lastRollover = await prisma.studentPromotion.findFirst({
    where: { instituteId: req.instituteId },
    orderBy: { createdAt: "desc" },
    select: { fromSession: true, toSession: true, createdAt: true },
  });

  return ok(res, {
    currentSession: institute.currentSession,
    // The session as a span of days, which is what makes an attendance row or
    // a fee period answerable to a year at all.
    current: {
      id: current.id,
      name: current.name,
      startsOn: current.startsOn,
      endsOn: current.endsOn,
    },
    sessions: sessions.map((s) => ({
      id: s.id, name: s.name, startsOn: s.startsOn, endsOn: s.endsOn, isCurrent: s.isCurrent,
    })),
    suggestedNext: nextSessionName(institute.currentSession),
    classes: classes
      .map((c) => ({ grade: c.grade, section: c.section, students: c._count._all }))
      .sort((a, b) => a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section)),
    lastRollover,
  });
});

/**
 * PATCH /api/institutes/me/session — move the school into the next session.
 *
 * Deliberately separate from promoting students. A school promotes class by
 * class over several days, and only closes the session once every class has
 * been dealt with; doing both in one action would force the whole rollover
 * into a single irreversible click.
 */
export const updateSession = asyncHandler(async (req, res) => {
  const next = String(req.body.currentSession ?? "").trim();

  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { currentSession: true, name: true },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  // The service writes the session row and the institute's mirrored name in
  // one transaction — the string only exists to mirror the row.
  const session = await moveToSession(req.instituteId, next, {
    ...(req.body.startsOn && req.body.endsOn && {
      startsOn: req.body.startsOn,
      endsOn: req.body.endsOn,
    }),
  });

  audit(req, {
    action: "institute.session",
    entity: "Institute",
    entityId: req.instituteId,
    meta: { from: institute.currentSession, to: next, startsOn: session.startsOn, endsOn: session.endsOn },
  });

  return ok(
    res,
    { currentSession: session.name, session },
    `${institute.name} is now running ${next}.`
  );
});

/** PATCH /api/institutes/me/sessions/:id — adjust one session's dates. */
export const updateSessionDates = asyncHandler(async (req, res) => {
  const session = await reviseSessionDates(req.instituteId, req.params.id, {
    startsOn: req.body.startsOn,
    endsOn: req.body.endsOn,
  });

  audit(req, {
    action: "institute.session_dates",
    entity: "AcademicSession",
    entityId: session.id,
    meta: { name: session.name, startsOn: session.startsOn, endsOn: session.endsOn },
  });

  return ok(res, session, `${session.name} now runs from ${session.startsOn.toISOString().slice(0, 10)} to ${session.endsOn.toISOString().slice(0, 10)}.`);
});

/**
 * The examination terms of one academic year.
 *
 * Scoped to a session rather than the institute, so a school that moves from
 * three terms to two keeps the terms last year's cards were written in. The
 * standard three are created the first time a year is asked for its terms —
 * visible and editable, unlike the enum they replace.
 */
const ownSession = async (req) => {
  const session = await prisma.academicSession.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId },
    select: { id: true, name: true },
  });
  if (!session) throw ApiError.notFound("Session not found");
  return session;
};

/** GET /api/institutes/me/sessions/:id/terms */
export const listSessionTerms = asyncHandler(async (req, res) => {
  const session = await ownSession(req);
  const terms = await ensureTerms(session.id);
  return ok(res, {
    session,
    terms,
    // True only when every term carries a share and they add up to 100.
    weighted: weightingIsComplete(terms),
    totalWeightage: terms.reduce((sum, t) => sum + (t.weightage ?? 0), 0),
  });
});

/** POST /api/institutes/me/sessions/:id/terms */
export const createSessionTerm = asyncHandler(async (req, res) => {
  const session = await ownSession(req);
  const term = await createTerm(session.id, req.body);

  audit(req, {
    action: "institute.term_create",
    entity: "ExamTerm",
    entityId: term.id,
    meta: { session: session.name, name: term.name, sequence: term.sequence },
  });

  return created(res, term, `"${term.name}" added to ${session.name}.`);
});

/**
 * PATCH /api/institutes/me/sessions/:id/terms/order
 *
 * The whole year, in the order the school wants it. Declared before the
 * `:termId` route so "order" is not read as a term id.
 */
export const reorderSessionTerms = asyncHandler(async (req, res) => {
  const session = await ownSession(req);
  const terms = await reorderTerms(session.id, req.body?.order);

  audit(req, {
    action: "institute.term_reorder",
    entity: "AcademicSession",
    entityId: session.id,
    meta: { session: session.name, order: terms.map((t) => t.name) },
  });

  return ok(res, { terms }, `${session.name}: ${terms.map((t) => t.name).join(" → ")}`);
});

/** PATCH /api/institutes/me/sessions/:id/terms/:termId */
export const updateSessionTerm = asyncHandler(async (req, res) => {
  const session = await ownSession(req);
  const before = await prisma.examTerm.findFirst({
    where: { id: req.params.termId, academicSessionId: session.id },
    select: { weightage: true },
  });
  const term = await updateTerm(session.id, req.params.termId, req.body);

  audit(req, {
    action: "institute.term_update",
    entity: "ExamTerm",
    entityId: term.id,
    meta: { session: session.name, name: term.name, weightage: term.weightage },
  });

  /**
   * A changed share moves every rolled-up score in the year.
   *
   * Result cards recompute from the marks and are right immediately. The
   * student list, the dashboards and the class positions read
   * `Enrollment.currentScore`, which was written under the old shares — so
   * they trail until each subject is next recalculated. Saying how many are
   * behind is more honest than rewriting rows the school did not ask to
   * touch, and it tells an admin there is a Recalculate to run.
   */
  const shareChanged = before && before.weightage !== term.weightage;
  const stale = shareChanged ? await scoresBuiltOnOldWeighting(session.id) : 0;

  return ok(
    res,
    { ...term, scoresToRefresh: stale },
    stale
      ? `"${term.name}" updated. Result cards use the new shares straight away; ` +
        `${stale} stored subject score(s) refresh when their subject is next recalculated.`
      : `"${term.name}" updated.`
  );
});

/**
 * DELETE /api/institutes/me/sessions/:id/terms/:termId
 *
 * The marks recorded under the term survive it and stop belonging to any term.
 * A school correcting a term it created by mistake must not lose the exam that
 * was sat under it, so the count of released marks is reported rather than
 * hidden.
 */
export const deleteSessionTerm = asyncHandler(async (req, res) => {
  const session = await ownSession(req);
  const { name, marksReleased } = await deleteTerm(session.id, req.params.termId);

  audit(req, {
    action: "institute.term_delete",
    entity: "ExamTerm",
    entityId: req.params.termId,
    meta: { session: session.name, name, marksReleased },
  });

  return ok(
    res,
    { name, marksReleased },
    marksReleased
      ? `"${name}" removed. ${marksReleased} mark(s) kept, and now belong to no term.`
      : `"${name}" removed.`
  );
});

/** GET /api/institutes/me/grading */
export const getGradingSettings = asyncHandler(async (req, res) => {
  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { gradingSettings: true },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  const policy = gradingPolicy(institute);
  return ok(res, {
    ...policy,
    // So a screen can show what a school would fall back to, and say plainly
    // whether the school has actually chosen anything.
    isDefault: !institute.gradingSettings,
    defaults: { bands: DEFAULT_BANDS, passingPercentage: DEFAULT_PASSING },
  });
});

/**
 * PATCH /api/institutes/me/grading
 *
 * Validated here rather than in a schema because the shape is a list whose
 * entries have to make sense together: bands must not repeat a threshold, and a
 * scale with no floor would leave a low mark ungraded.
 */
export const updateGradingSettings = asyncHandler(async (req, res) => {
  const current = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { gradingSettings: true, name: true },
  });
  if (!current) throw ApiError.notFound("Institute not found");

  const patch = {};

  if (req.body.bands !== undefined) {
    if (!Array.isArray(req.body.bands) || !req.body.bands.length) {
      throw ApiError.badRequest("A grading scale needs at least one band");
    }
    const bands = req.body.bands.map((b, i) => {
      const min = Number(b?.min);
      const letter = String(b?.letter ?? "").trim();
      if (!Number.isFinite(min) || min < 0 || min > 100) {
        throw ApiError.badRequest(`Band ${i + 1}: "min" has to be a percentage between 0 and 100`);
      }
      if (!letter) throw ApiError.badRequest(`Band ${i + 1}: every band needs a letter`);
      const point = b?.point === undefined ? 0 : Number(b.point);
      if (!Number.isFinite(point) || point < 0 || point > 5) {
        throw ApiError.badRequest(`Band ${i + 1}: "point" has to be between 0 and 5`);
      }
      return { min, letter, point };
    });

    const mins = bands.map((b) => b.min);
    if (new Set(mins).size !== mins.length) {
      throw ApiError.badRequest("Two bands start at the same percentage — a mark would have two grades");
    }
    if (!bands.some((b) => b.min === 0)) {
      throw ApiError.badRequest("The lowest band has to start at 0, or a low mark has no grade at all");
    }
    patch.bands = bands.sort((a, b) => b.min - a.min);
  }

  if (req.body.passingPercentage !== undefined) {
    const pass = Number(req.body.passingPercentage);
    if (!Number.isFinite(pass) || pass < 0 || pass > 100) {
      throw ApiError.badRequest("The pass mark has to be a percentage between 0 and 100");
    }
    patch.passingPercentage = pass;
  }

  if (!Object.keys(patch).length) {
    throw ApiError.badRequest("Nothing to change — send bands, a passingPercentage, or both");
  }

  const merged = { ...(current.gradingSettings ?? {}), ...patch };
  await prisma.institute.update({
    where: { id: req.instituteId },
    data: { gradingSettings: merged },
  });

  audit(req, {
    action: "institute.grading",
    entity: "Institute",
    entityId: req.instituteId,
    meta: patch,
  });

  const policy = gradingPolicy({ gradingSettings: merged });

  /**
   * Stored letter grades are not rewritten here.
   *
   * `Enrollment.letterGrade` is a cache written when marks were last recalculated,
   * and the card computes its own letters from the live policy — so the card is
   * right immediately. The cached letters catch up the next time a subject is
   * recalculated. Saying how many are now stale is more honest than silently
   * rewriting rows the school did not ask to touch.
   */
  const stale = await prisma.enrollment.count({
    where: { student: { instituteId: req.instituteId }, currentScore: { not: null } },
  });

  return ok(
    res,
    { ...policy, cachedGradesToRefresh: stale },
    `${current.name}: grading policy updated. Result cards use it straight away; ` +
      `${stale} stored grade(s) refresh when their subject is next recalculated.`
  );
});

export const updateNotificationSettings = asyncHandler(async (req, res) => {
  const patch = sanitizeNotificationSettings(req.body);
  if (!Object.keys(patch).length) {
    throw ApiError.badRequest(
      `No valid settings provided. Expected any of: ${NOTIFICATION_PREFS.map((p) => p.key).join(", ")}`
    );
  }

  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { notificationSettings: true },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  const merged = { ...notificationSettings(institute), ...patch };

  const updated = await prisma.institute.update({
    where: { id: req.instituteId },
    data: { notificationSettings: merged },
    select: { notificationSettings: true },
  });

  audit(req, {
    action: "institute.notification_settings",
    entity: "Institute",
    entityId: req.instituteId,
    meta: patch,
  });

  const values = notificationSettings(updated);
  return ok(
    res,
    NOTIFICATION_PREFS.map((p) => ({
      key: p.key,
      label: p.label,
      description: p.description,
      controls: p.controls,
      enabled: values[p.key],
    })),
    "Notification settings saved."
  );
});

// ───────────────────── Admin self-service subscription ─────────────────────

const SUB_INCLUDE = {
  plan: { select: PLAN_PUBLIC },
  _count: { select: { students: { where: { deletedAt: null } } } },
};

const loadMyInstitute = async (instituteId) => {
  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    include: SUB_INCLUDE,
  });
  if (!institute) throw ApiError.notFound("Institute not found");
  return institute;
};

/**
 * GET /api/institutes/me/subscription
 * What the admin's institute is actually on, plus the plans it could move to.
 * One source of truth for the dashboard and the settings page.
 */
export const mySubscription = asyncHandler(async (req, res) => {
  const institute = await loadMyInstitute(req.instituteId);
  const students = institute._count.students;

  const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { price: "asc" } });

  return ok(res, {
    ...subscriptionSummary(institute, students),
    institute: { id: institute.id, name: institute.name, code: institute.code },
    availablePlans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      maxStudents: p.maxStudents,
      color: p.color,
      features: p.features,
      isCurrent: p.id === institute.planId,
      isUpgrade: p.price > institute.plan.price,
      // A plan they can't fit into is shown with the reason rather than hidden.
      selectable: p.id !== institute.planId && p.maxStudents >= students,
      blockedReason:
        p.maxStudents < students
          ? `Your ${students} students exceed this plan's ${p.maxStudents} limit`
          : null,
    })),
  });
});

/**
 * POST /api/institutes/me/subscription/plan
 * Admin self-service plan change. Writes the same `planId` the backend
 * enforces against, so new limits apply immediately — no frontend-only state.
 */
export const changeMyPlan = asyncHandler(async (req, res) => {
  const { planId, studentLimit } = req.body;

  const institute = await loadMyInstitute(req.instituteId);
  const plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true } });

  if (!plan) throw ApiError.badRequest("That plan does not exist or is no longer offered");
  if (plan.id === institute.planId) throw ApiError.badRequest(`You are already on the ${plan.name} plan`);

  const students = institute._count.students;
  if (students > plan.maxStudents) {
    throw ApiError.badRequest(
      `Cannot move to ${plan.name}: it allows ${plan.maxStudents} students and you have ${students}.`
    );
  }

  // Carry any custom cap across, clamped so it can never exceed the new plan.
  const nextLimit =
    studentLimit != null
      ? Math.min(studentLimit, plan.maxStudents)
      : institute.studentLimit != null
        ? Math.min(institute.studentLimit, plan.maxStudents)
        : null;

  if (nextLimit != null && nextLimit < students) {
    throw ApiError.badRequest(`A limit of ${nextLimit} is below your current ${students} students.`);
  }

  const updated = await prisma.institute.update({
    where: { id: institute.id },
    data: {
      planId: plan.id,
      studentLimit: nextLimit,
      // Changing plan is an intent to continue — undo a pending cancellation.
      cancelAtPeriodEnd: false,
      subscriptionEndsAt: null,
    },
    include: SUB_INCLUDE,
  });

  audit(req, {
    action: "subscription.change_plan",
    entity: "Institute",
    entityId: institute.id,
    meta: { from: institute.plan.name, to: plan.name, studentLimit: nextLimit },
  });

  return ok(
    res,
    subscriptionSummary(updated, updated._count.students),
    `Switched to ${plan.name} — your student limit is now ${effectiveStudentLimit(updated)}.`
  );
});

/** PATCH /api/institutes/me/subscription/limit — adjust the cap within the plan. */
export const changeMyStudentLimit = asyncHandler(async (req, res) => {
  const { studentLimit } = req.body;
  const institute = await loadMyInstitute(req.instituteId);
  const students = institute._count.students;

  if (studentLimit != null) {
    if (studentLimit > institute.plan.maxStudents) {
      throw ApiError.badRequest(
        `The ${institute.plan.name} plan allows at most ${institute.plan.maxStudents} students. Upgrade to raise the limit.`
      );
    }
    if (studentLimit < students) {
      throw ApiError.badRequest(`You already have ${students} students, so the limit cannot be ${studentLimit}.`);
    }
  }

  const updated = await prisma.institute.update({
    where: { id: institute.id },
    data: { studentLimit: studentLimit ?? null },
    include: SUB_INCLUDE,
  });

  audit(req, {
    action: "subscription.change_limit",
    entity: "Institute",
    entityId: institute.id,
    meta: { studentLimit: studentLimit ?? null },
  });

  return ok(
    res,
    subscriptionSummary(updated, updated._count.students),
    studentLimit == null
      ? `Limit now follows the ${institute.plan.name} plan (${institute.plan.maxStudents} students).`
      : `Student limit set to ${studentLimit}.`
  );
});

/**
 * POST /api/institutes/me/subscription/cancel
 * End-of-period cancellation: nothing is deleted, the school keeps working
 * until the period ends, and it stays visible to the super admin throughout.
 */
export const cancelMySubscription = asyncHandler(async (req, res) => {
  const institute = await loadMyInstitute(req.instituteId);
  if (institute.cancelAtPeriodEnd) {
    throw ApiError.badRequest("Your subscription is already scheduled to cancel");
  }

  const endsAt = endOfCurrentPeriod();

  const updated = await prisma.institute.update({
    where: { id: institute.id },
    data: { cancelAtPeriodEnd: true, subscriptionEndsAt: endsAt },
    include: SUB_INCLUDE,
  });

  audit(req, {
    action: "subscription.cancel",
    entity: "Institute",
    entityId: institute.id,
    meta: { endsAt, reason: req.body?.reason ?? null },
  });

  return ok(
    res,
    subscriptionSummary(updated, updated._count.students),
    `Subscription cancelled. ${institute.name} stays fully active until ${endsAt.toDateString()} and no data is removed.`
  );
});

/** POST /api/institutes/me/subscription/resume */
export const resumeMySubscription = asyncHandler(async (req, res) => {
  const institute = await loadMyInstitute(req.instituteId);
  if (!institute.cancelAtPeriodEnd) throw ApiError.badRequest("Your subscription is not cancelled");

  const updated = await prisma.institute.update({
    where: { id: institute.id },
    data: { cancelAtPeriodEnd: false, subscriptionEndsAt: null },
    include: SUB_INCLUDE,
  });

  audit(req, { action: "subscription.resume", entity: "Institute", entityId: institute.id });

  return ok(
    res,
    subscriptionSummary(updated, updated._count.students),
    "Subscription resumed — the scheduled cancellation has been removed."
  );
});

/**
 * DELETE /api/institutes/:id
 *
 * Soft delete. The institute and everything it owns vanish from the platform
 * but stay in the database, so a mis-click doesn't destroy a school's records.
 * Use `POST /:id/restore` to bring it back, or `DELETE /:id/purge` to erase it
 * for good.
 */
export const deleteInstitute = asyncHandler(async (req, res) => {
  const institute = await prisma.institute.findUnique({ where: { id: req.params.id } });
  if (!institute) throw ApiError.notFound("Institute not found");

  await prisma.institute.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), status: "CANCELLED" },
  });

  // Its users lose access immediately, without losing their accounts.
  await prisma.user.updateMany({
    where: { instituteId: req.params.id },
    data: { isActive: false },
  });

  audit(req, {
    action: "institute.delete",
    entity: "Institute",
    entityId: req.params.id,
    meta: { name: institute.name, soft: true },
  });

  return ok(
    res,
    null,
    `${institute.name} has been deleted. It can be restored from the recycle bin.`
  );
});

/** GET /api/institutes/deleted — the recycle bin. */
export const listDeletedInstitutes = asyncHandler(async (_req, res) => {
  const institutes = await prismaRaw.institute.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    include: {
      plan: { select: PLAN_PUBLIC },
      _count: { select: { students: true, teachers: true } },
    },
  });

  // Scrubbed like every other institute response. This one was missed while
  // it had no caller; the super admin recycle bin gave it one, which would
  // have put our gateway customer and subscription ids in a browser.
  return ok(
    res,
    institutes.map((i) => ({
      ...withoutProviderIds(i),
      students: i._count.students,
      teachers: i._count.teachers,
      _count: undefined,
    }))
  );
});

/** POST /api/institutes/:id/restore */
export const restoreInstitute = asyncHandler(async (req, res) => {
  const institute = await prismaRaw.institute.findUnique({ where: { id: req.params.id } });
  if (!institute) throw ApiError.notFound("Institute not found");
  if (!institute.deletedAt) throw ApiError.badRequest("That institute is not deleted");

  await prismaRaw.institute.update({
    where: { id: req.params.id },
    data: { deletedAt: null, status: "ACTIVE" },
  });
  await prismaRaw.user.updateMany({
    where: { instituteId: req.params.id },
    data: { isActive: true },
  });

  audit(req, { action: "institute.restore", entity: "Institute", entityId: req.params.id });
  return ok(res, null, `${institute.name} restored and reactivated.`);
});

/**
 * DELETE /api/institutes/:id/purge
 * The irreversible one — only reachable for an already-deleted institute, so
 * it takes two deliberate steps to destroy a school's data.
 */
export const purgeInstitute = asyncHandler(async (req, res) => {
  const institute = await prismaRaw.institute.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { students: true, teachers: true, parents: true } } },
  });

  if (!institute) throw ApiError.notFound("Institute not found");
  if (!institute.deletedAt) {
    throw ApiError.badRequest(
      "Delete the institute first. Purging is only possible from the recycle bin."
    );
  }

  await prismaRaw.institute.delete({ where: { id: req.params.id } });

  audit(req, {
    action: "institute.purge",
    entity: "Institute",
    entityId: req.params.id,
    meta: { name: institute.name, ...institute._count },
  });

  return ok(
    res,
    null,
    `${institute.name} permanently erased — ${institute._count.students} students, ${institute._count.teachers} teachers and all related records.`
  );
});

