import { z } from "zod";
import { booleanQuery, dateString, periodString } from "./common.js";

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

export const createInvoiceSchema = z.object({
  studentId: z.string().min(1),
  period: periodString,
  amount: z.coerce.number().int().min(0),
  discount: z.coerce.number().int().min(0).optional(),
  lateFee: z.coerce.number().int().min(0).optional(),
  dueDate: dateString.optional(),
  notes: z.string().trim().max(240).optional().nullable(),
  instituteId: z.string().optional(),
});

/** Generate the month's invoices for every active student at once. */
export const generateInvoicesSchema = z.object({
  period: periodString,
  amount: z.coerce.number().int().min(0).optional(),
  dueDay: z.coerce.number().int().min(1).max(28).optional(),
  grade: z.string().optional(),
  instituteId: z.string().optional(),
});

export const payInvoiceSchema = z.object({
  paidAmount: z.coerce.number().int().min(0).optional(),
  method: z.enum(["Cash", "Bank Transfer", "Cheque", "JazzCash", "EasyPaisa", "Card"]).optional(),
  reference: z.string().trim().max(60).optional().nullable(),
  paidAt: dateString.optional(),
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
