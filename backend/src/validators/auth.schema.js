import { z } from "zod";
import { emailField, passwordField, phone } from "./common.js";

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

/**
 * Refresh carries no body at all — the token travels only in the httpOnly
 * cookie. `refreshToken` and `tokenInBody` used to be accepted here; both are
 * gone, so a caller can neither supply a token nor ask for one back.
 */
export const refreshSchema = z.object({});

/** Public institute signup — creates the institute *and* its first admin. */
export const signupSchema = z.object({
  name: z.string().trim().min(2, "Institute name is required").max(120),
  city: z.string().trim().min(2, "City is required").max(60),
  phone,
  email: emailField,
  address: z.string().trim().max(240).optional(),
  approxStudents: z.coerce.number().int().min(0).max(100000).optional(),
  /** The seat cap the school wants. Clamped to the plan's maximum server-side. */
  studentLimit: z.coerce
    .number({ invalid_type_error: "Student limit must be a number" })
    .int("Student limit must be a whole number")
    .positive("Student limit must be at least 1")
    .max(100000, "Student limit is unrealistically high")
    .optional(),
  planId: z.enum(["starter", "growth", "elite"]).default("starter"),

  adminName: z.string().trim().min(2, "Admin name is required").max(120),
  adminEmail: emailField,
  adminPhone: phone.optional(),
  adminPassword: passwordField,

  /**
   * What the school actually runs, asked once rather than assumed forever.
   *
   * All three were platform decisions before: every school got an April
   * session, a 33% pass mark and three terms called First/Mid/Final. April
   * is right for most of the country and wrong for Karachi and the
   * Cambridge track; a school that finds out later has to edit its session
   * dates by hand. Optional, so nothing that already posts a signup breaks —
   * the old defaults are what an absent field still means.
   */
  sessionStartMonth: z.coerce
    .number()
    .int()
    .min(1, "Pick a month")
    .max(12, "Pick a month")
    .optional(),
  passingPercentage: z.coerce
    .number()
    .min(0, "The pass mark is a percentage")
    .max(100, "The pass mark is a percentage")
    .optional(),
  terms: z
    .array(z.string().trim().min(1, "A term needs a name").max(60))
    .min(1, "A year needs at least one term")
    .max(6, "Six terms is more than any school runs")
    .optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20, "Reset token is missing or malformed"),
  password: passwordField,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordField,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phone.optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});
