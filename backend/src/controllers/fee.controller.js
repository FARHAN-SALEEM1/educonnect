import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { periodLabel } from "../utils/academics.js";
import { netAmount, balanceOf } from "../utils/fees.js";
import { studentScopeWhere } from "../utils/access.js";
import { sendFeeReminder } from "../services/email.service.js";
import { notificationEnabled } from "../utils/notifications.js";
import { DEFAULT_TIMEZONE, dateOnly, todayIn } from "../utils/dates.js";
import { count } from "../utils/plural.js";

/**
 * The day a challan falls due, as a calendar date.
 *
 * `new Date(year, month - 1, day)` builds midnight in the *server's*
 * timezone, so the same billing run wrote a different instant depending on
 * where it ran — while every other date in the product is UTC midnight of the
 * calendar day (see utils/dates.js). The day is capped at 28 upstream, so
 * this cannot roll into the next month.
 */
const dueOn = (period, day) => dateOnly(`${period}-${String(day).padStart(2, "0")}`);

/** GET /api/fees */
/**
 * What a challan comes to.
 *
 * `FeeInvoice.amount` stays the authoritative total; when a challan is
 * itemised it is kept equal to the sum of its lines, so nothing downstream —
 * stats, reminders, the defaulters report, the result card — has to know
 * whether heads were used.
 */
const sumItems = (items) => (items ?? []).reduce((total, i) => total + Number(i.amount || 0), 0);

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
      orderBy: [{ period: "desc" }, { student: { name: "asc" } }, { id: "asc" }],
      include: {
        student: { select: { id: true, name: true, rollNo: true, grade: true, section: true } },
        items: { orderBy: { createdAt: "asc" } },
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
    invoices.map((i) => ({ ...i, net: netAmount(i), balance: balanceOf(i) })),
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
      items: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!invoice) throw ApiError.notFound("Invoice not found");
  return ok(res, { ...invoice, net: netAmount(invoice), balance: balanceOf(invoice) });
});

/** POST /api/fees — issue a single invoice. */
export const createInvoice = asyncHandler(async (req, res) => {
  const { studentId, period, items, instituteId: _ignored, ...data } = req.body;

  if (!items?.length && data.amount === undefined) {
    throw ApiError.badRequest("Give an amount, or the heads it is made up of");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, instituteId: req.instituteId },
  });
  if (!student) throw ApiError.notFound("Student not found in this institute");

  const existing = await prisma.feeInvoice.findUnique({
    where: { studentId_period: { studentId, period } },
  });
  if (existing) throw ApiError.conflict(`An invoice for ${periodLabel(period)} already exists`);


  const invoice = await prisma.feeInvoice.create({
    data: {
      ...data,
      studentId,
      period,
      instituteId: req.instituteId,
      title: periodLabel(period),
      // Itemised challans total their lines; the amount is not a second opinion.
      amount: items?.length ? sumItems(items) : data.amount,
      dueDate: data.dueDate ?? dueOn(period, 10),
      ...(items?.length && {
        items: {
          create: items.map((i) => ({ head: i.head, label: i.label ?? null, amount: i.amount })),
        },
      }),
    },
    include: { student: { select: { name: true } }, items: { orderBy: { createdAt: "asc" } } },
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
  const { period, amount, items, dueDay = 10, grade } = req.body;

  const institute = await prisma.institute.findUnique({ where: { id: req.instituteId } });
  if (!institute) throw ApiError.notFound("Institute not found");

  // A breakdown decides the total; otherwise the flat amount, or the
  // institute's standing monthly fee.
  const feeAmount = items?.length ? sumItems(items) : (amount ?? institute.defaultMonthlyFee);
  if (!feeAmount) {
    throw ApiError.badRequest(
      "No amount given and this institute has no default monthly fee set. Pass `amount`, or the heads it is made up of, or set defaultMonthlyFee on the institute."
    );
  }

  const students = await prisma.student.findMany({
    where: { instituteId: req.instituteId, status: "ACTIVE", ...(grade && { grade }) },
    select: { id: true },
  });

  if (!students.length) throw ApiError.badRequest("No active students to invoice");

  const dueDate = dueOn(period, dueDay);

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

  /**
   * The breakdown, written once per invoice that this run actually created.
   *
   * `createMany` cannot write nested rows, and `skipDuplicates` means the
   * response does not say which students were new — so the invoices for this
   * period that still have no lines are exactly the ones to itemise. That also
   * leaves an already-issued challan and its existing lines alone, which is
   * what re-running a billing run should do.
   */
  if (items?.length && result.count) {
    const fresh = await prisma.feeInvoice.findMany({
      where: {
        instituteId: req.instituteId,
        period,
        studentId: { in: students.map((s) => s.id) },
        items: { none: {} },
      },
      select: { id: true },
    });

    if (fresh.length) {
      await prisma.feeItem.createMany({
        data: fresh.flatMap((inv) =>
          items.map((i) => ({
            invoiceId: inv.id,
            head: i.head,
            label: i.label ?? null,
            amount: i.amount,
          }))
        ),
      });
    }
  }

  audit(req, {
    action: "fee.generate",
    entity: "FeeInvoice",
    meta: { period, amount: feeAmount, created: result.count, heads: items?.length ?? 0 },
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
      heads: items ?? [],
    },
    `${count(result.count,"invoice")} generated for ${periodLabel(period)}`
  );
});

/** POST /api/fees/:id/pay — record a payment. */
export const payInvoice = asyncHandler(async (req, res) => {
  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { student: { select: { name: true } } },
  });

  if (!invoice) throw ApiError.notFound("Invoice not found");
  if (invoice.status === "WAIVED") throw ApiError.badRequest("This invoice has been waived");

  const due = netAmount(invoice);
  const alreadyPaid = invoice.paidAmount ?? 0;
  const balance = due - alreadyPaid;

  if (balance <= 0) throw ApiError.badRequest("This invoice is already paid in full");

  /**
   * An instalment, not a settlement.
   *
   * This used to stamp the invoice PAID for whatever was handed over, so a
   * family paying Rs. 3,000 of an Rs. 11,500 challan settled the whole thing:
   * the remaining Rs. 8,500 left the pending total, left the defaulters report
   * and left the reminders, and nothing anywhere said it was still owed.
   */
  const payment = req.body.paidAmount ?? balance;
  if (payment <= 0) throw ApiError.badRequest("A payment has to be more than zero");
  if (payment > balance) {
    throw ApiError.badRequest(
      `That is more than the Rs. ${balance.toLocaleString("en-PK")} still due on this invoice` +
        (alreadyPaid ? ` (Rs. ${alreadyPaid.toLocaleString("en-PK")} already received).` : ".")
    );
  }

  const paidTotal = alreadyPaid + payment;
  const settled = paidTotal >= due;

  const updated = await prisma.feeInvoice.update({
    where: { id: invoice.id },
    data: {
      // An unsettled invoice keeps the status it had, so one that was already
      // overdue does not quietly become current because something was paid.
      ...(settled && { status: "PAID" }),
      paidAmount: paidTotal,
      // The date the challan was cleared. Left alone while a balance remains,
      // so "Paid On" never claims a challan was settled that was not.
      ...(settled && { paidAt: req.body.paidAt ?? new Date() }),
      method: req.body.method ?? invoice.method ?? "Cash",
      ...(req.body.reference !== undefined && { reference: req.body.reference }),
    },
    include: { student: { select: { id: true, name: true, rollNo: true } }, items: { orderBy: { createdAt: "asc" } } },
  });

  audit(req, {
    action: "fee.payment",
    entity: "FeeInvoice",
    entityId: invoice.id,
    meta: { amount: payment, paidTotal, settled, method: updated.method },
  });

  const left = due - paidTotal;
  return ok(
    res,
    { ...updated, net: due, balance: left, settled, receivedNow: payment },
    settled
      ? `PKR ${payment.toLocaleString("en-PK")} received from ${updated.student.name} — challan cleared.`
      : `PKR ${payment.toLocaleString("en-PK")} received from ${updated.student.name}. Rs. ${left.toLocaleString("en-PK")} still due.`
  );
});

/** PATCH /api/fees/:id */
export const updateInvoice = asyncHandler(async (req, res) => {
  const existing = await prisma.feeInvoice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { _count: { select: { items: true } } },
  });
  if (!existing) throw ApiError.notFound("Invoice not found");

  const { items, ...data } = req.body;

  // The total and the lines have to agree, and the lines are the ones a parent
  // reads. Re-typing the total of an itemised challan without saying which head
  // moved would leave the two disagreeing with nothing to say which is right.
  if (data.amount !== undefined && items === undefined && existing._count.items > 0) {
    throw ApiError.badRequest("This invoice is itemised — send the heads, not just a total");
  }

  const invoice = await prisma.$transaction(async (tx) => {
    // A breakdown is sent whole: replacing it is how a line gets corrected or
    // removed. An empty array is the way back to a plain single-amount challan.
    if (items) {
      await tx.feeItem.deleteMany({ where: { invoiceId: existing.id } });
      if (items.length) {
        await tx.feeItem.createMany({
          data: items.map((i) => ({
            invoiceId: existing.id,
            head: i.head,
            label: i.label ?? null,
            amount: i.amount,
          })),
        });
      }
    }

    return tx.feeInvoice.update({
      where: { id: existing.id },
      data: { ...data, ...(items?.length && { amount: sumItems(items) }) },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
  });

  return ok(res, invoice, "Invoice updated");
});

/** DELETE /api/fees/:id */
export const deleteInvoice = asyncHandler(async (req, res) => {
  const existing = await prisma.feeInvoice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { student: { select: { name: true } } },
  });
  if (!existing) throw ApiError.notFound("Invoice not found");

  /**
   * A challan money has been received against is not deletable.
   *
   * This used to hard-delete anything: a fully settled Rs. 20,000 challan
   * could be removed outright, the collection figure dropped by that much,
   * and nothing anywhere recorded that it had ever existed or who removed
   * it. The fee register is the one thing a school office is held to.
   *
   * Deleting an invoice nobody has paid is still fine — that is how a
   * challan issued by mistake is withdrawn. Once a rupee has been received,
   * the way to cancel it is to waive it, which leaves the record standing.
   */
  if ((existing.paidAmount ?? 0) > 0) {
    throw ApiError.badRequest(
      `Rs. ${(existing.paidAmount ?? 0).toLocaleString("en-PK")} has already been received against ` +
        `the ${existing.title} challan for ${existing.student.name}, so it cannot be deleted. ` +
        "Set it to WAIVED instead — that cancels what is still owed and keeps the receipt."
    );
  }

  await prisma.feeInvoice.delete({ where: { id: existing.id } });

  // Every other delete in this product writes one of these. The one that
  // touches money did not.
  audit(req, {
    action: "fee.delete",
    entity: "FeeInvoice",
    entityId: existing.id,
    meta: {
      student: existing.student.name,
      period: existing.period,
      amount: existing.amount,
      discount: existing.discount,
      lateFee: existing.lateFee,
      status: existing.status,
    },
  });

  return ok(res, null, `${existing.title} challan deleted. Nothing had been paid against it.`);
});

/**
 * POST /api/fees/mark-overdue
 * Flips PENDING invoices past their due date to OVERDUE and applies a
 * late fee. Intended to be run on a schedule (or manually by an admin).
 */
export const markOverdue = asyncHandler(async (req, res) => {
  const lateFee = Number(req.body?.lateFee) || 0;

  /**
   * One school at a time, always.
   *
   * The institute filter was spread in conditionally, so a caller without
   * one — a platform admin, who gets `req.instituteId = null` unless they ask
   * for a school — dropped it entirely and flipped every pending invoice on
   * the platform to OVERDUE, applying one school's late fee to all of them.
   * A late fee is a school's own policy and this is a bulk write over money.
   */
  if (!req.instituteId) {
    throw ApiError.badRequest(
      "Say which school to mark overdue — this writes to every unpaid invoice in it."
    );
  }

  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    select: { timezone: true },
  });

  const result = await prisma.feeInvoice.updateMany({
    where: {
      instituteId: req.instituteId,
      status: "PENDING",
      /**
       * Overdue once the due day has *passed*, not the moment it begins.
       *
       * This compared against `new Date()`, and a due date is stored at
       * midnight — so a challan due on the 10th turned OVERDUE at 00:00 on
       * the 10th. The family became a defaulter, was chased by a reminder and
       * charged the late fee, on the very day the fee was actually due.
       */
      dueDate: { lt: todayIn(institute?.timezone || DEFAULT_TIMEZONE) },
    },
    data: { status: "OVERDUE", ...(lateFee && { lateFee }) },
  });

  return ok(res, { updated: result.count }, `${count(result.count,"invoice")} marked overdue`);
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
    const total = items.reduce((sum, i) => sum + balanceOf(i), 0);
    const lines = items
      .map((i) => `• ${i.student.name} — ${i.title}: Rs. ${balanceOf(i).toLocaleString()} (${i.status.toLowerCase()}${i.paidAmount ? `, Rs. ${i.paidAmount.toLocaleString()} already received` : ""})`)
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
        amount: balanceOf(i),
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
    `Reminder sent to ${count(recipients.length,"guardian")} covering ${count(invoices.length,"unpaid invoice")}` +
      (skipped.length ? `. ${count(skipped.length,"student")} skipped — no guardian linked.` : ".")
  );
});

/** GET /api/fees/stats — collection figures for the admin dashboard. */
export const feeStats = asyncHandler(async (req, res) => {
  const where = req.instituteId ? { instituteId: req.instituteId } : {};

  const [byStatus, byPeriod] = await Promise.all([
    prisma.feeInvoice.groupBy({
      by: ["status"],
      where,
      _sum: { amount: true, discount: true, lateFee: true, paidAmount: true },
      _count: true,
    }),
    prisma.feeInvoice.groupBy({
      by: ["period", "status"],
      where,
      _sum: { amount: true, discount: true, lateFee: true, paidAmount: true },
      orderBy: { period: "asc" },
    }),
  ]);

  /**
   * Every figure here is net of discounts, late fees and part payments.
   *
   * It used to total raw `amount` and count a PAID invoice's `paidAmount` as
   * collected, which meant the unpaid part of a part-paid challan was counted
   * in neither the collected column nor the outstanding one. Money simply left
   * the books.
   */
  const stats = { collected: 0, pending: 0, overdue: 0, waived: 0, totalInvoiced: 0 };
  for (const row of byStatus) {
    const net = (row._sum.amount ?? 0) - (row._sum.discount ?? 0) + (row._sum.lateFee ?? 0);
    const paid = row._sum.paidAmount ?? 0;
    const left = Math.max(0, net - paid);

    stats.totalInvoiced += net;
    // Received is received, whatever the invoice's status says.
    stats.collected += paid;

    if (row.status === "PENDING") stats.pending += left;
    else if (row.status === "OVERDUE") stats.overdue += left;
    else if (row.status === "WAIVED") stats.waived += left;
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
    // Billed net of discounts, collected from what was actually received —
    // the chart used to call a PAID invoice's full amount collected while the
    // KPI above it used paidAmount, so the two disagreed on the same screen.
    entry.billed += (row._sum.amount ?? 0) - (row._sum.discount ?? 0) + (row._sum.lateFee ?? 0);
    entry.collected += row._sum.paidAmount ?? 0;
  }

  return ok(res, {
    ...stats,
    outstanding,
    collectionRate: collectible ? Number(((stats.collected / collectible) * 100).toFixed(1)) : 0,
    monthly: [...monthly.values()],
  });
});
