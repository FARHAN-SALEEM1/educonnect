import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok, paginate, pageMeta } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { periodLabel } from "../utils/academics.js";

/**
 * Defaults for platform settings. Seeded on first read so a fresh database
 * still returns a complete, editable set rather than an empty form.
 */
export const DEFAULT_SETTINGS = [
  { key: "platformName", value: "EduConnect", label: "Platform Name", type: "text" },
  { key: "supportEmail", value: "support@educonnect.io", label: "Support Email", type: "email" },
  { key: "currency", value: "PKR", label: "Default Currency", type: "text" },
  { key: "trialDays", value: "14", label: "Trial Duration (days)", type: "number" },
];

/** Reads a single setting, falling back to its default. Used by signup. */
export async function getSetting(key) {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  if (row) return row.value;
  return DEFAULT_SETTINGS.find((s) => s.key === key)?.value ?? null;
}

/** GET /api/platform/settings */
export const getSettings = asyncHandler(async (_req, res) => {
  const existing = await prisma.platformSetting.findMany();
  const byKey = new Map(existing.map((s) => [s.key, s]));

  // Backfill anything missing so the client always gets the full set.
  const missing = DEFAULT_SETTINGS.filter((d) => !byKey.has(d.key));
  if (missing.length) {
    await prisma.platformSetting.createMany({ data: missing, skipDuplicates: true });
    for (const m of missing) byKey.set(m.key, m);
  }

  return ok(res, DEFAULT_SETTINGS.map((d) => byKey.get(d.key) ?? d));
});

/** PATCH /api/platform/settings — body is { key: value, … } */
export const updateSettings = asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body ?? {});
  if (!entries.length) throw ApiError.badRequest("No settings provided");

  const allowed = new Set(DEFAULT_SETTINGS.map((s) => s.key));
  const unknown = entries.filter(([k]) => !allowed.has(k)).map(([k]) => k);
  if (unknown.length) throw ApiError.badRequest(`Unknown setting(s): ${unknown.join(", ")}`);

  for (const [key, value] of entries) {
    const def = DEFAULT_SETTINGS.find((s) => s.key === key);
    const str = String(value ?? "").trim();

    if (!str) throw ApiError.badRequest(`${def.label} cannot be empty`);
    if (def.type === "number" && (!/^\d+$/.test(str) || Number(str) < 0)) {
      throw ApiError.badRequest(`${def.label} must be a whole number`);
    }
    if (def.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str)) {
      throw ApiError.badRequest(`${def.label} must be a valid email address`);
    }

    await prisma.platformSetting.upsert({
      where: { key },
      create: { ...def, value: str },
      update: { value: str },
    });
  }

  audit(req, {
    action: "platform.settings_update",
    entity: "PlatformSetting",
    meta: { keys: entries.map(([k]) => k) },
  });

  const all = await prisma.platformSetting.findMany();
  const byKey = new Map(all.map((s) => [s.key, s]));
  return ok(res, DEFAULT_SETTINGS.map((d) => byKey.get(d.key) ?? d), "Settings saved");
});

/** PATCH /api/plans/:id — edit a subscription tier. */
export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await prisma.plan.findUnique({
    where: { id: req.params.id },
    // Only live students may block a seat-cap reduction — counting removed
    // ones would refuse a legitimate downgrade on seats nobody occupies.
    include: {
      institutes: { select: { _count: { select: { students: { where: { deletedAt: null } } } } } },
    },
  });
  if (!plan) throw ApiError.notFound("Plan not found");

  const { price, maxStudents, name, features, popular, isActive } = req.body;

  // Don't let a seat cap drop below what subscribers are already using.
  if (maxStudents !== undefined) {
    const largest = plan.institutes.reduce((max, i) => Math.max(max, i._count.students), 0);
    if (maxStudents < largest) {
      throw ApiError.badRequest(
        `Cannot set the limit to ${maxStudents}: an institute on this plan already has ${largest} students.`
      );
    }
  }

  const updated = await prisma.plan.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price }),
      ...(maxStudents !== undefined && { maxStudents }),
      ...(features !== undefined && { features }),
      ...(popular !== undefined && { popular }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  audit(req, { action: "plan.update", entity: "Plan", entityId: updated.id, meta: { price, maxStudents } });
  return ok(res, updated, `${updated.name} plan updated`);
});

/**
 * GET /api/subscription-invoices
 * Platform billing — what each institute owes EduConnect.
 */
export const listSubscriptionInvoices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, 50);
  const { status, instituteId, period } = req.query;

  const where = {
    ...(status && { status }),
    ...(instituteId && { instituteId }),
    ...(period && { period }),
  };

  const [total, invoices, totals] = await Promise.all([
    prisma.subscriptionInvoice.count({ where }),
    prisma.subscriptionInvoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ period: "desc" }, { issuedAt: "desc" }],
      include: {
        institute: { select: { id: true, name: true, code: true, logo: true, city: true } },
        plan: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.subscriptionInvoice.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: true }),
  ]);

  const summary = totals.reduce(
    (acc, r) => ({ ...acc, [r.status]: { count: r._count, amount: r._sum.amount ?? 0 } }),
    {}
  );

  return ok(
    res,
    invoices.map((i) => ({ ...i, label: periodLabel(i.period) })),
    "Subscription invoices fetched",
    { ...pageMeta(total, page, limit), summary }
  );
});

/** POST /api/subscription-invoices/:id/pay */
export const paySubscriptionInvoice = asyncHandler(async (req, res) => {
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: req.params.id },
    include: { institute: { select: { name: true } } },
  });

  if (!invoice) throw ApiError.notFound("Subscription invoice not found");
  if (invoice.status === "PAID") throw ApiError.badRequest("This invoice is already marked paid");

  const updated = await prisma.subscriptionInvoice.update({
    where: { id: invoice.id },
    data: { status: "PAID", paidAt: new Date() },
    include: {
      institute: { select: { id: true, name: true, logo: true } },
      plan: { select: { id: true, name: true, color: true } },
    },
  });

  audit(req, {
    action: "subscription.payment",
    entity: "SubscriptionInvoice",
    entityId: invoice.id,
    meta: { amount: invoice.amount, institute: invoice.institute.name },
  });

  return ok(res, updated, `Payment recorded for ${updated.institute.name}`);
});

/**
 * POST /api/subscription-invoices/generate
 * Issues the current period's invoice for every active institute.
 */
export const generateSubscriptionInvoices = asyncHandler(async (req, res) => {
  const { period } = req.body;

  const institutes = await prisma.institute.findMany({
    where: { status: "ACTIVE" },
    include: { plan: { select: { id: true, price: true } } },
  });

  if (!institutes.length) throw ApiError.badRequest("No active institutes to invoice");

  const result = await prisma.subscriptionInvoice.createMany({
    data: institutes.map((i) => ({
      instituteId: i.id,
      planId: i.plan.id,
      period,
      amount: i.plan.price,
      status: "PENDING",
    })),
    skipDuplicates: true,
  });

  audit(req, {
    action: "subscription.generate",
    entity: "SubscriptionInvoice",
    meta: { period, created: result.count },
  });

  return ok(
    res,
    { period, label: periodLabel(period), created: result.count, skipped: institutes.length - result.count },
    `${result.count} subscription invoice(s) generated for ${periodLabel(period)}`
  );
});

