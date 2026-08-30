import { z } from "zod";
import { booleanQuery, dateString, notFutureDate, periodString } from "./common.js";

// ── Attendance ────────────────────────────────────────────────

const attendanceStatus = z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]);

export const markAttendanceSchema = z.object({
  studentId: z.string().min(1),
  date: dateString,
  status: attendanceStatus,
  remarks: z.string().trim().max(240).optional().nullable(),
  instituteId: z.string().optional(),
});

/** Mark a whole class in one request — what the teacher portal actually does. */
export const bulkAttendanceSchema = z.object({
  date: dateString,
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: attendanceStatus,
        remarks: z.string().trim().max(240).optional().nullable(),
      })
    )
    .min(1, "Add at least one attendance record"),
  instituteId: z.string().optional(),
});

export const attendanceQuery = z.object({
  studentId: z.string().optional(),
  grade: z.string().optional(),
  section: z.string().optional(),
  date: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: attendanceStatus.optional(),
  instituteId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// ── Fees ──────────────────────────────────────────────────────

/** The heads a school bills under — mirrors the FeeHead enum. */
export const FEE_HEADS = ["TUITION","ADMISSION","ANNUAL","EXAMINATION","TRANSPORT","HOSTEL","LIBRARY","SPORTS","LAB","MISCELLANEOUS"];

/** One line on a challan. */
const feeItem = z.object({
  head: z.enum(FEE_HEADS),
  label: z.string().trim().max(60).optional().nullable(),
  amount: z.coerce.number().int().min(0),
});


/**
 * A discount cannot be larger than the charge it comes off.
 *
 * `{ amount: 3000, discount: 5000 }` was accepted, leaving a challan whose net
 * payable was minus two thousand. The outstanding total survived it — the
 * figures clamp at zero — but the invoiced total quietly shrank, and the
 * printed challan showed a Pakistani parent a negative balance.
 *
 * Checked on the object rather than the field, because it is a relationship
 * between two of them. Only applied when both are present: a PATCH that moves
 * one alone is checked against the stored row in the controller.
 */
const discountWithinAmount = (value, ctx) => {
  if (value.amount === undefined || value.discount === undefined) return;
  if (value.discount > value.amount) {
    ctx.addIssue({
      code: "custom",
      path: ["discount"],
      message: `A discount of Rs. ${value.discount.toLocaleString("en-PK")} is more than the Rs. ${value.amount.toLocaleString("en-PK")} being charged`,
    });
  }
};
export const createInvoiceSchema = z.object({
  studentId: z.string().min(1),
  period: periodString,
  // Optional when `items` are given: the total is then their sum, so an
  // amount typed alongside them could only ever disagree.
  amount: z.coerce.number().int().min(0).optional(),
  items: z.array(feeItem).max(20).optional(),
  discount: z.coerce.number().int().min(0).optional(),
  lateFee: z.coerce.number().int().min(0).optional(),
  dueDate: dateString.optional(),
  notes: z.string().trim().max(240).optional().nullable(),
  instituteId: z.string().optional(),
}).superRefine(discountWithinAmount);

/** Generate the month's invoices for every active student at once. */
export const generateInvoicesSchema = z.object({
  period: periodString,
  amount: z.coerce.number().int().min(0).optional(),
  // The month's standard breakdown, applied to every invoice in the run.
  items: z.array(feeItem).max(20).optional(),
  dueDay: z.coerce.number().int().min(1).max(28).optional(),
  grade: z.string().optional(),
  instituteId: z.string().optional(),
});

/**
 * Editing an already-issued challan.
 *
 * This route had no schema at all: whatever the body held was spread straight
 * into a Prisma update, which meant an admin could reach fields — and nested
 * relation writes such as `student: { connect: ... }` — that no screen offers
 * and that scoping does not re-check.
 */
export const updateInvoiceSchema = z.object({
  amount: z.coerce.number().int().min(0).optional(),
  items: z.array(feeItem).max(20).optional(),
  discount: z.coerce.number().int().min(0).optional(),
  lateFee: z.coerce.number().int().min(0).optional(),
  dueDate: dateString.optional(),
  status: z.enum(["PENDING", "PAID", "OVERDUE", "WAIVED"]).optional(),
  notes: z.string().trim().max(240).optional().nullable(),
}).superRefine(discountWithinAmount);

export const payInvoiceSchema = z.object({
  paidAmount: z.coerce.number().int().min(0).optional(),
  method: z.enum(["Cash", "Bank Transfer", "Cheque", "JazzCash", "EasyPaisa", "Card"]).optional(),
  reference: z.string().trim().max(60).optional().nullable(),
  paidAt: notFutureDate("Payment date").optional(),
});

export const feeQuery = z.object({
  studentId: z.string().optional(),
  status: z.enum(["PENDING", "PAID", "OVERDUE", "WAIVED"]).optional(),
  period: z.string().optional(),
  grade: z.string().optional(),
  instituteId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

// ── Messages ──────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  recipientId: z.string().min(1, "Choose who to send this to"),
  subject: z.string().trim().min(1, "Subject is required").max(140),
  body: z.string().trim().min(1, "Message body is required").max(5000),
  studentId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
});

export const replyMessageSchema = z.object({
  body: z.string().trim().min(1, "Reply cannot be empty").max(5000),
});

export const messageQuery = z.object({
  box: z.enum(["inbox", "sent", "all"]).optional(),
  unreadOnly: booleanQuery,
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  instituteId: z.string().optional(),
});

// ── Notices ───────────────────────────────────────────────────

export const createNoticeSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(140),
  body: z.string().trim().min(2, "Body is required").max(5000),
  category: z.enum(["ACADEMIC", "FINANCE", "EVENT", "GENERAL", "URGENT"]).default("GENERAL"),
  audience: z.array(z.enum(["SUPERADMIN", "ADMIN", "TEACHER", "PARENT"])).optional().default([]),
  isPinned: z.boolean().optional(),
  publishedAt: dateString.optional(),
  expiresAt: dateString.optional().nullable(),
  instituteId: z.string().optional(),
});

export const updateNoticeSchema = createNoticeSchema.partial();

/** Super admin broadcast — omit instituteIds to reach every active institute. */
export const broadcastNoticeSchema = createNoticeSchema
  .omit({ instituteId: true })
  .extend({ instituteIds: z.array(z.string()).optional() });

export const noticeQuery = z.object({
  category: z.enum(["ACADEMIC", "FINANCE", "EVENT", "GENERAL", "URGENT"]).optional(),
  search: z.string().trim().optional(),
  includeExpired: booleanQuery,
  instituteId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
