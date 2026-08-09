import { z } from "zod";

export const idParam = z.object({ id: z.string().min(1, "id is required") });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().trim().optional(),
  sortBy: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  instituteId: z.string().optional(),
});

export const optionalDate = z
  .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()])
  .optional()
  .nullable();

export const dateString = z
  .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()])
  .transform((v) => new Date(v));

export const periodString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must look like 2026-03");

/**
 * Query-string booleans. `z.coerce.boolean()` is wrong here — it applies
 * JS truthiness, so the string "false" becomes `true`.
 */
export const booleanQuery = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1")
  .optional();

export const phone = z.string().trim().min(7).max(20);

export const emailField = z.string().trim().toLowerCase().email("Enter a valid email address");

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long");
