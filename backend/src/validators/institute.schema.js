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
});

export const updateInstituteSchema = createInstituteSchema.partial();

export const changePlanSchema = z.object({
  planId: z.enum(["starter", "growth", "elite"]),
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
