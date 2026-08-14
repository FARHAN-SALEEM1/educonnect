import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { periodLabel } from "../utils/academics.js";
import { studentScopeWhere } from "../utils/access.js";
import { sendFeeReminder } from "../services/email.service.js";
import { notificationEnabled } from "../utils/notifications.js";

const netAmount = (invoice) => invoice.amount - invoice.discount + invoice.lateFee;

/** GET /api/fees */
export const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { studentId, status, period, grade } = req.query;

  const studentScope = await studentScopeWhere(req);

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(status && { status }),
    ...(period && { period }),
    student: {
      ...studentScope,
      ...(studentId && { id: studentId }),
      ...(grade && { grade }),
    },
  };

  const [total, invoices, totals] = await Promise.all([
    prisma.feeInvoice.count({ where }),
    prisma.feeInvoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ period: "desc" }, { student: { name: "asc" } }],
      include: {
        student: { select: { id: true, name: true, rollNo: true, grade: true, section: true } },
      },
    }),
    prisma.feeInvoice.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: true }),
  ]);

  const summary = totals.reduce(
    (acc, row) => {
      acc[row.status] = { count: row._count, amount: row._sum.amount ?? 0 };
      return acc;
    },
    {}
  );

  return ok(
    res,
    invoices.map((i) => ({ ...i, net: netAmount(i) })),
    "Fee invoices fetched",
    { ...pageMeta(total, page, limit), summary }
  );
});

/** GET /api/fees/:id */
export const getInvoice = asyncHandler(async (req, res) => {
  const studentScope = await studentScopeWhere(req);

  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: req.params.id, student: studentScope },
    include: {
      student: { select: { id: true, name: true, rollNo: true, grade: true, section: true } },
      institute: { select: { id: true, name: true, logo: true, city: true } },
    },
  });

  if (!invoice) throw ApiError.notFound("Invoice not found");
  return ok(res, { ...invoice, net: netAmount(invoice) });
});

/** POST /api/fees — issue a single invoice. */
export const createInvoice = asyncHandler(async (req, res) => {
  const { studentId, period, instituteId: _ignored, ...data } = req.body;

  const student = await prisma.student.findFirst({
    where: { id: studentId, instituteId: req.instituteId },
  });
  if (!student) throw ApiError.notFound("Student not found in this institute");

  const existing = await prisma.feeInvoice.findUnique({
    where: { studentId_period: { studentId, period } },
  });
  if (existing) throw ApiError.conflict(`An invoice for ${periodLabel(period)} already exists`);

  const [year, month] = period.split("-").map(Number);

  const invoice = await prisma.feeInvoice.create({
    data: {
      ...data,
      studentId,
      period,
      instituteId: req.instituteId,
      title: periodLabel(period),
      dueDate: data.dueDate ?? new Date(year, month - 1, 10),
    },
    include: { student: { select: { name: true } } },
  });

  audit(req, { action: "fee.create", entity: "FeeInvoice", entityId: invoice.id });
  return created(res, invoice, `Invoice issued for ${invoice.student.name}`);
});

/**
 * POST /api/fees/generate
 * Issues the month's invoice for every active student in one go —
 * the monthly billing run an admin triggers.
 */
export const generateInvoices = asyncHandler(async (req, res) => {
  const { period, amount, dueDay = 10, grade } = req.body;

  const institute = await prisma.institute.findUnique({ where: { id: req.instituteId } });
  if (!institute) throw ApiError.notFound("Institute not found");

  const feeAmount = amount ?? institute.defaultMonthlyFee;
  if (!feeAmount) {
    throw ApiError.badRequest(
      "No amount given and this institute has no default monthly fee set. Pass `amount` or set defaultMonthlyFee on the institute."
    );
  }

  const students = await prisma.student.findMany({
    where: { instituteId: req.instituteId, status: "ACTIVE", ...(grade && { grade }) },
    select: { id: true },
  });

  if (!students.length) throw ApiError.badRequest("No active students to invoice");

  const [year, month] = period.split("-").map(Number);
  const dueDate = new Date(year, month - 1, dueDay);

  const result = await prisma.feeInvoice.createMany({
    data: students.map((s) => ({
      studentId: s.id,
      instituteId: req.instituteId,
      period,
      title: periodLabel(period),
      amount: feeAmount,
      dueDate,
    })),
    // Students already invoiced for this period are left untouched.
    skipDuplicates: true,
  });

  audit(req, {
    action: "fee.generate",
    entity: "FeeInvoice",
    meta: { period, amount: feeAmount, created: result.count },
  });

  return created(
    res,
    {
      period,
      label: periodLabel(period),
      amount: feeAmount,
      created: result.count,
      skipped: students.length - result.count,
      totalBilled: result.count * feeAmount,
    },
    `${result.count} invoice(s) generated for ${periodLabel(period)}`
  );
});

/** POST /api/fees/:id/pay — record a payment. */
export const payInvoice = asyncHandler(async (req, res) => {
  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { student: { select: { name: true } } },
  });

  if (!invoice) throw ApiError.notFound("Invoice not found");
  if (invoice.status === "PAID") throw ApiError.badRequest("This invoice is already paid");
  if (invoice.status === "WAIVED") throw ApiError.badRequest("This invoice has been waived");

  const due = netAmount(invoice);
  const paidAmount = req.body.paidAmount ?? due;

  const updated = await prisma.feeInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "PAID",
      paidAmount,
      paidAt: req.body.paidAt ?? new Date(),
      method: req.body.method ?? "Cash",
      reference: req.body.reference ?? null,
    },
    include: { student: { select: { id: true, name: true, rollNo: true } } },
  });

  audit(req, {
    action: "fee.payment",
    entity: "FeeInvoice",
    entityId: invoice.id,
    meta: { amount: paidAmount, method: updated.method },
  });

  return ok(
    res,
    { ...updated, net: due, balance: due - paidAmount },
    `PKR ${paidAmount.toLocaleString()} received from ${updated.student.name}`
  );
});

/** PATCH /api/fees/:id */
export const updateInvoice = asyncHandler(async (req, res) => {
  const existing = await prisma.feeInvoice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Invoice not found");

  const { studentId: _s, period: _p, instituteId: _i, ...data } = req.body;

  const invoice = await prisma.feeInvoice.update({ where: { id: existing.id }, data });
  return ok(res, invoice, "Invoice updated");
});

/** DELETE /api/fees/:id */
export const deleteInvoice = asyncHandler(async (req, res) => {
  const existing = await prisma.feeInvoice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Invoice not found");

  await prisma.feeInvoice.delete({ where: { id: existing.id } });
  return ok(res, null, "Invoice deleted");
});

/**
 * POST /api/fees/mark-overdue
 * Flips PENDING invoices past their due date to OVERDUE and applies a
 * late fee. Intended to be run on a schedule (or manually by an admin).
 */
export const markOverdue = asyncHandler(async (req, res) => {
  const lateFee = Number(req.body?.lateFee) || 0;

  const result = await prisma.feeInvoice.updateMany({
    where: {
      ...(req.instituteId && { instituteId: req.instituteId }),
      status: "PENDING",
      dueDate: { lt: new Date() },
    },
    data: { status: "OVERDUE", ...(lateFee && { lateFee }) },
  });

  return ok(res, { updated: result.count }, `${result.count} invoice(s) marked overdue`);
});

/**
 * POST /api/fees/remind
 *
 * Sends a fee reminder to the guardian of every student with an unpaid
 * invoice, using the existing Message model and email service — no second
 * notification system. Parents without a login still get the email; the
 * in-app message is only created where a User exists to receive it.
 */
export const sendFeeReminders = asyncHandler(async (req, res) => {
  const { period, includeOverdueOnly = false } = req.body ?? {};

  // The "Fee reminders to parents" toggle is enforced here, not just in the
  // UI — turning it off genuinely stops reminders, including via direct API.
  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { notificationSettings: true },
  });
  if (!notificationEnabled(institute, "feeReminders")) {
    throw ApiError.badRequest(
      "Fee reminders are turned off for this institute. Enable them in Settings → Notifications first."
    );
  }

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      instituteId: req.instituteId,
      status: includeOverdueOnly ? "OVERDUE" : { in: ["PENDING", "OVERDUE"] },
      ...(period && { period }),
    },
    include: {
      student: {
        include: { parent: { include: { user: { select: { id: true, isActive: true } } } } },
      },
      institute: { select: { name: true } },
    },
  });

  if (!invoices.length) {
    return ok(res, { sent: 0, skipped: [], recipients: [] }, "Nothing to remind about — no unpaid invoices.");
  }

  // One message per guardian, not per invoice, so a parent with three
  // children gets a single reminder listing all of them.
  const byParent = new Map();
  const skipped = [];

  for (const inv of invoices) {
    const parent = inv.student.parent;
    if (!parent) {
      skipped.push({ student: inv.student.name, reason: "no guardian linked" });
      continue;
    }
    if (!byParent.has(parent.id)) byParent.set(parent.id, { parent, items: [] });
    byParent.get(parent.id).items.push(inv);
  }

  const instituteName = invoices[0].institute.name;
  const recipients = [];

  for (const { parent, items } of byParent.values()) {
    const total = items.reduce((sum, i) => sum + (i.amount - i.discount + i.lateFee), 0);
    const lines = items
      .map((i) => `• ${i.student.name} — ${i.title}: Rs. ${(i.amount - i.discount + i.lateFee).toLocaleString()} (${i.status.toLowerCase()})`)
      .join("\n");

    const subject = `Fee reminder — Rs. ${total.toLocaleString()} outstanding`;
    const body =
      `Dear ${parent.name},\n\nOur records show the following outstanding fees at ${instituteName}:\n\n${lines}\n\n` +
      `Total due: Rs. ${total.toLocaleString()}\n\nPlease clear the balance at your earliest convenience. ` +
      `If you have already paid, kindly ignore this message.`;

    // In-app message only where the guardian actually has an account.
    if (parent.user?.id && parent.user.isActive) {
      await prisma.message.create({
        data: {
          instituteId: req.instituteId,
          senderId: req.user.id,
          recipientId: parent.user.id,
          subject,
          body,
          studentId: items[0].studentId,
        },
      });
    }

    // Never let a mail failure abort the run — the service already swallows.
    const delivery = await sendFeeReminder({
      to: parent.email,
      name: parent.name,
      instituteName,
      total,
      items: items.map((i) => ({
        student: i.student.name,
        title: i.title,
        amount: i.amount - i.discount + i.lateFee,
        status: i.status,
      })),
    });

    recipients.push({
      parent: parent.name,
      email: parent.email,
      students: items.length,
      total,
      messaged: Boolean(parent.user?.id && parent.user.isActive),
      emailed: delivery.delivered,
    });
  }

  audit(req, {
    action: "fee.remind",
    entity: "FeeInvoice",
    meta: { reminders: recipients.length, invoices: invoices.length, skipped: skipped.length },
  });

  return ok(
    res,
    { sent: recipients.length, invoices: invoices.length, recipients, skipped },
    `Reminder sent to ${recipients.length} guardian(s) covering ${invoices.length} unpaid invoice(s)` +
      (skipped.length ? `. ${skipped.length} student(s) skipped — no guardian linked.` : ".")
  );
});

/** GET /api/fees/stats — collection figures for the admin dashboard. */
export const feeStats = asyncHandler(async (req, res) => {
  const where = req.instituteId ? { instituteId: req.instituteId } : {};

  const [byStatus, byPeriod] = await Promise.all([
    prisma.feeInvoice.groupBy({
      by: ["status"],
      where,
      _sum: { amount: true, paidAmount: true },
      _count: true,
    }),
    prisma.feeInvoice.groupBy({
      by: ["period", "status"],
      where,
      _sum: { amount: true },
      orderBy: { period: "asc" },
    }),
  ]);

  const stats = { collected: 0, pending: 0, overdue: 0, waived: 0, totalInvoiced: 0 };
  for (const row of byStatus) {
    const amount = row._sum.amount ?? 0;
    stats.totalInvoiced += amount;
    if (row.status === "PAID") stats.collected += row._sum.paidAmount ?? amount;
    else if (row.status === "PENDING") stats.pending += amount;
    else if (row.status === "OVERDUE") stats.overdue += amount;
    else if (row.status === "WAIVED") stats.waived += amount;
  }

  const outstanding = stats.pending + stats.overdue;
  const collectible = stats.collected + outstanding;

  // Month-by-month collected vs billed, for the trend chart.
  const monthly = new Map();
  for (const row of byPeriod) {
    if (!monthly.has(row.period)) {
      monthly.set(row.period, { period: row.period, label: periodLabel(row.period), billed: 0, collected: 0 });
    }
    const entry = monthly.get(row.period);
    entry.billed += row._sum.amount ?? 0;
    if (row.status === "PAID") entry.collected += row._sum.amount ?? 0;
  }

  return ok(res, {
    ...stats,
    outstanding,
    collectionRate: collectible ? Number(((stats.collected / collectible) * 100).toFixed(1)) : 0,
    monthly: [...monthly.values()],
  });
});
