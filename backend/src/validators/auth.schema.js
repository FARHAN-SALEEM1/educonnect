import { z } from "zod";
import { emailField, passwordField, phone } from "./common.js";

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

/**
 * The refresh token normally arrives in the httpOnly cookie, so the body is
 * optional — it's only used by clients without a cookie jar.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
  tokenInBody: z.boolean().optional(),
});

/** Public institute signup — creates the institute *and* its first admin. */
export const signupSchema = z.object({
  name: z.string().trim().min(2, "Institute name is required").max(120),
  city: z.string().trim().min(2, "City is required").max(60),
  phone,
  email: emailField,
  address: z.string().trim().max(240).optional(),
  approxStudents: z.coerce.number().int().min(0).max(100000).optional(),
  planId: z.enum(["starter", "growth", "elite"]).default("starter"),

  adminName: z.string().trim().min(2, "Admin name is required").max(120),
  adminEmail: emailField,
  adminPhone: phone.optional(),
  adminPassword: passwordField,
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
