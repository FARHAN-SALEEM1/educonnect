import { z } from "zod";
import { emailField, phone } from "./common.js";
import { isValidTimeZone } from "../utils/dates.js";

export const createInstituteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(60),
  email: emailField,
  phone,
  address: z.string().trim().max(240).optional(),
  logo: z.string().max(16).optional(),
  color: z.string().max(24).optional(),
  planId: z.enum(["starter", "growth", "elite"]),
  defaultMonthlyFee: z.coerce.number().int().min(0).optional(),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"]).optional(),
  // Rejected at the edge rather than blowing up later inside Intl.
  timezone: z
    .string()
    .refine(isValidTimeZone, { message: "Not a recognised IANA timezone, e.g. Asia/Karachi" })
    .optional(),

  /**
   * The school's first admin, created with the school.
   *
   * Required, not optional. A self-service signup always produces an admin, but
   * this route produced an institute nobody could sign in to — the button that
   * calls it says "Create & Send Credentials", and there were no credentials to
   * send. A school with no way in is not a half-finished record, it is a broken
   * one, so the schema refuses to make one.
   *
   * The password is optional: left out, a temporary one is generated and either
   * emailed or handed back in the response, exactly as for a teacher or parent.
   */
  adminName: z.string().trim().min(2).max(120),
  adminEmail: emailField,
  adminPassword: z.string().min(6).max(72).optional(),
});

/**
 * Editing an institute never touches its admin account — that is what the user
 * routes are for — so the admin fields are dropped rather than made partial.
 */
export const updateInstituteSchema = createInstituteSchema
  .omit({ adminName: true, adminEmail: true, adminPassword: true })
  .partial();

export const changePlanSchema = z.object({
  planId: z.enum(["starter", "growth", "elite"]),
});

/** Admin self-service plan change. planId is validated against the DB too. */
export const changeMyPlanSchema = z.object({
  planId: z.string().min(1, "Choose a plan"),
  studentLimit: z.coerce
    .number({ invalid_type_error: "Student limit must be a number" })
    .int("Student limit must be a whole number")
    .positive("Student limit must be at least 1")
    .optional()
    .nullable(),
});

export const changeStudentLimitSchema = z.object({
  // null clears the override and falls back to the plan's maximum.
  studentLimit: z.coerce
    .number({ invalid_type_error: "Student limit must be a number" })
    .int("Student limit must be a whole number")
    .positive("Student limit must be at least 1")
    .max(100000, "Student limit is unrealistically high")
    .nullable(),
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const changeStatusSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"]),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailField,
  password: z.string().min(8).max(72).optional(),
  role: z.enum(["SUPERADMIN", "ADMIN", "TEACHER", "PARENT"]),
  phone: phone.optional(),
  instituteId: z.string().optional(),
});

/**
 * An admin-set password must clear the same bar as a self-service one —
 * otherwise the policy is only enforced on the path users take voluntarily.
 */
export const adminResetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(72).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phone.optional().nullable(),
  isActive: z.boolean().optional(),
  role: z.enum(["SUPERADMIN", "ADMIN", "TEACHER", "PARENT"]).optional(),
});
