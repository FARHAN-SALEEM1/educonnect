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

/**
 * Pakistani mobile format: exactly 11 digits starting 03, e.g. 03001234567.
 *
 * Formatting characters are stripped first, so a pasted "0300-1234567" is
 * accepted and normalised — but +92, 0092, letters and wrong lengths are not.
 * This is the authority: the browser rules in frontend/src/utils/validate.js
 * mirror it, and a request sent straight to the API still lands here.
 */
const EXAMPLE = "For example 03001234567";

/**
 * superRefine rather than chained .refine() so the user gets exactly ONE
 * message naming the actual problem, instead of four overlapping ones.
 *
 * Formatting characters are rejected, not stripped: the required format is
 * exactly 11 digits, so "0300-1234567" is an error rather than something
 * silently rewritten behind the user's back.
 */
export const phone = z
  .string({ invalid_type_error: "Phone number must be text" })
  .trim()
  .superRefine((v, ctx) => {
    const fail = (message) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    };

    if (!v) return fail(`Phone number is required. ${EXAMPLE}`);
    if (/^(\+92|0092)/.test(v)) return fail(`Phone number must start with 03, not +92 or 0092. ${EXAMPLE}`);
    if (/[\s()-]/.test(v)) return fail(`Phone number must be digits only — no spaces, dashes or brackets. ${EXAMPLE}`);
    if (!/^\d+$/.test(v)) return fail(`Phone number may only contain digits. ${EXAMPLE}`);
    if (!v.startsWith("03")) return fail(`Phone number must start with 03. ${EXAMPLE}`);
    if (v.length !== 11) return fail(`Phone number must be exactly 11 digits — you entered ${v.length}. ${EXAMPLE}`);
    if (!/^03\d{9}$/.test(v)) return fail(`Enter a valid Pakistani mobile number. ${EXAMPLE}`);
  });

/**
 * Stricter than Zod's `.email()`, which accepts `test@gmail` and `a@b`.
 * Requires a dotted domain with a 2+ letter TLD, and rejects consecutive dots
 * and leading/trailing dots in the local part.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export const emailField = z
  .string({ required_error: "Email is required", invalid_type_error: "Email must be text" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .refine((v) => !v.includes(".."), { message: "Email can't contain two dots in a row" })
  .refine((v) => (v.split("@")[0] ?? "").length <= 64, { message: "Email is too long before the @" })
  .refine((v) => !/^\.|\.$/.test(v.split("@")[0] ?? ""), {
    message: "Email can't start or end with a dot before the @",
  })
  .refine((v) => EMAIL_RE.test(v), {
    message: "Enter a valid email address — for example name@gmail.com",
  });

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long");
