import { prisma, prismaRaw } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { nextInstituteCode } from "../utils/codes.js";
import { audit } from "../utils/audit.js";
import { periodKey } from "../utils/academics.js";
import {
  effectiveStudentLimit,
  endOfCurrentPeriod,
  subscriptionSummary,
} from "../utils/subscription.js";
import {
  NOTIFICATION_PREFS,
  notificationSettings,
  sanitizeNotificationSettings,
} from "../utils/notifications.js";

/** GET /api/plans — public, powers the pricing section on the landing page. */
export const listPlans = asyncHandler(async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
    include: { _count: { select: { institutes: true } } },
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
        plan: true,
        _count: { select: { students: { where: { deletedAt: null } }, teachers: { where: { deletedAt: null } }, parents: { where: { deletedAt: null } }, users: true } },
      },
    }),
  ]);

  const data = institutes.map((i) => ({
    ...i,
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
      plan: true,
      _count: { select: { students: { where: { deletedAt: null } }, teachers: { where: { deletedAt: null } }, parents: { where: { deletedAt: null } }, subjects: true } },
      subscriptionInvoices: { orderBy: { period: "desc" }, take: 12 },
    },
  });

  if (!institute) throw ApiError.notFound("Institute not found");

  return ok(res, {
    ...institute,
    counts: institute._count,
    _count: undefined,
  });
});

/** POST /api/institutes — super admin creates an institute directly. */
export const createInstitute = asyncHandler(async (req, res) => {
  const code = await nextInstituteCode();
  const plan = await prisma.plan.findUnique({ where: { id: req.body.planId } });
  if (!plan) throw ApiError.badRequest("Selected plan does not exist");

  const institute = await prisma.institute.create({
    data: { ...req.body, code, status: req.body.status ?? "ACTIVE" },
    include: { plan: true },
  });

  await prisma.subscriptionInvoice.create({
    data: {
      instituteId: institute.id,
      planId: plan.id,
      period: periodKey(),
      amount: plan.price,
      status: "PENDING",
    },
  });

  audit(req, { action: "institute.create", entity: "Institute", entityId: institute.id });
  return created(res, institute, "Institute created");
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
    include: { plan: true },
  });

  audit(req, { action: "institute.update", entity: "Institute", entityId: institute.id });
  return ok(res, institute, "Institute updated");
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
    include: { plan: true },
  });

  audit(req, {
    action: "institute.change_plan",
    entity: "Institute",
    entityId: updated.id,
    meta: { from: institute.planId, to: planId },
  });

  return ok(res, updated, `Plan changed to ${plan.name}`);
});

/** PATCH /api/institutes/:id/status — activate / suspend. */
export const changeStatus = asyncHandler(async (req, res) => {
  const institute = await prisma.institute.update({
    where: { id: req.params.id },
    data: { status: req.body.status },
    include: { plan: true },
  });

  audit(req, {
    action: "institute.change_status",
    entity: "Institute",
    entityId: institute.id,
    meta: { status: req.body.status },
  });

  return ok(res, institute, `Institute is now ${req.body.status.toLowerCase()}`);
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
  plan: true,
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
      plan: true,
      _count: { select: { students: true, teachers: true } },
    },
  });

  return ok(
    res,
    institutes.map((i) => ({
      ...i,
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

