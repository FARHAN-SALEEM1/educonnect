import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import {
  expiryDate,
  hashToken,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import crypto from "node:crypto";
import { nextInstituteCode } from "../utils/codes.js";
import { audit } from "../utils/audit.js";
import { sendPasswordChanged, sendPasswordReset } from "../services/email.service.js";
import { periodKey } from "../utils/academics.js";
import { getSetting } from "./platform.controller.js";

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone ?? null,
  avatarUrl: user.avatarUrl ?? null,
  instituteId: user.instituteId ?? null,
  institute: user.institute
    ? {
        id: user.institute.id,
        code: user.institute.code,
        name: user.institute.name,
        city: user.institute.city,
        logo: user.institute.logo,
        color: user.institute.color,
        status: user.institute.status,
        plan: user.institute.plan,
      }
    : null,
  teacherId: user.teacher?.id ?? null,
  parentId: user.parent?.id ?? null,
  lastLoginAt: user.lastLoginAt ?? null,
});

/**
 * Mints a session.
 *
 * The refresh token goes into an httpOnly cookie so JavaScript — and
 * therefore any XSS bug — can never read it. The short-lived access token is
 * still returned in the body for the client to hold in memory.
 *
 * Non-browser clients (a mobile app, curl, the test suite) can opt out with
 * `?tokenInBody=1` and get the refresh token in the response instead; they
 * have no cookie jar and no XSS surface to protect.
 */
const issueSession = async (user, req, res) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: expiryDate(env.jwt.refreshExpires),
      userAgent: req.headers["user-agent"]?.slice(0, 240) ?? null,
      ip: req.ip,
    },
  });

  res.cookie(env.cookie.name, refreshToken, refreshCookieOptions());

  const wantsBodyToken = req.query.tokenInBody === "1" || req.body?.tokenInBody === true;
  return wantsBodyToken ? { accessToken, refreshToken } : { accessToken };
};

/** The refresh token, from the cookie or — for API clients — the body. */
const readRefreshToken = (req) =>
  req.cookies?.[env.cookie.name] || req.body?.refreshToken || null;

const clearRefreshCookie = (res) => {
  const { maxAge: _ignored, ...options } = refreshCookieOptions();
  res.clearCookie(env.cookie.name, options);
};

const USER_INCLUDE = {
  institute: { include: { plan: true } },
  teacher: { select: { id: true } },
  parent: { select: { id: true } },
};

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
    include: USER_INCLUDE,
  });

  // Same message for unknown email and wrong password — don't confirm
  // which accounts exist.
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    throw ApiError.unauthorized("Incorrect email or password");
  }
  if (!user.isActive) throw ApiError.forbidden("Your account has been deactivated");

  // Same wording as the per-request check in middleware/auth.js, so a user
  // sees one consistent explanation whether they are logging in or already in.
  if (user.institute?.status === "SUSPENDED") {
    throw ApiError.forbidden(
      "Your institute account has been suspended. Please contact the administrator."
    );
  }
  if (user.institute?.status === "CANCELLED") {
    throw ApiError.forbidden(
      "Your institute account has been closed. Please contact the administrator."
    );
  }

  const tokens = await issueSession(user, req, res);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  audit(req, { action: "auth.login", entity: "User", entityId: user.id });

  return ok(res, { user: publicUser(user), ...tokens }, "Logged in successfully");
});

/**
 * POST /api/auth/signup
 * Public institute registration. Creates the institute, its first admin
 * user and the opening subscription invoice as one atomic unit.
 */
export const signup = asyncHandler(async (req, res) => {
  const {
    name, city, phone, email, address, approxStudents, studentLimit, planId,
    adminName, adminEmail, adminPhone, adminPassword,
  } = req.body;

  const [existingInstitute, existingUser] = await Promise.all([
    prisma.institute.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { email: adminEmail } }),
  ]);

  if (existingInstitute) throw ApiError.conflict("An institute is already registered with this email");
  if (existingUser) throw ApiError.conflict("This admin email is already in use");

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw ApiError.badRequest("Selected plan does not exist");

  const code = await nextInstituteCode();
  const passwordHash = await hashPassword(adminPassword);
  const trialDays = Number(await getSetting("trialDays")) || 14;

  const result = await prisma.$transaction(async (tx) => {
    const institute = await tx.institute.create({
      data: {
        code,
        name,
        city,
        email,
        phone,
        address: address ?? null,
        approxStudents: approxStudents ?? null,
        // The number the school asked for becomes its actual seat cap, never
        // above what the chosen plan allows. Previously this was collected and
        // then ignored, so every school silently inherited the plan maximum.
        studentLimit:
          studentLimit != null ? Math.min(studentLimit, plan.maxStudents) : null,
        planId,
        logo: "🏫",
        // New signups start PENDING; a super admin activates them.
        status: "PENDING",
        trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
      },
      include: { plan: true },
    });

    const admin = await tx.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        phone: adminPhone ?? null,
        passwordHash,
        role: "ADMIN",
        instituteId: institute.id,
      },
      include: USER_INCLUDE,
    });

    await tx.subscriptionInvoice.create({
      data: {
        instituteId: institute.id,
        planId: plan.id,
        period: periodKey(),
        amount: plan.price,
        status: "PENDING",
      },
    });

    return { institute, admin };
  });

  audit(req, {
    action: "institute.signup",
    entity: "Institute",
    entityId: result.institute.id,
    meta: { name, planId },
  });

  // Signup does not sign anyone in — new institutes start PENDING and an
  // admin must activate them first.
  return created(
    res,
    {
      institute: {
        id: result.institute.id,
        code: result.institute.code,
        name: result.institute.name,
        city: result.institute.city,
        status: result.institute.status,
        plan: result.institute.plan,
        trialEndsAt: result.institute.trialEndsAt,
      },
      admin: publicUser(result.admin),
    },
    "Institute registered. Your account is pending approval — you can log in once it is activated."
  );
});

/** POST /api/auth/refresh */
export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) throw ApiError.unauthorized("No refresh token provided");

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    clearRefreshCookie(res);
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized("Refresh token is no longer valid");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: USER_INCLUDE,
  });
  if (!user || !user.isActive) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized("Account unavailable");
  }

  // Rotate: the presented token dies with the response that replaces it.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueSession(user, req, res);
  return ok(res, { user: publicUser(user), ...tokens }, "Session refreshed");
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req);
  clearRefreshCookie(res);

  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else if (req.user) {
    // No token supplied — end every session for this user.
    await prisma.refreshToken.updateMany({
      where: { userId: req.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return ok(res, null, "Logged out");
});

/**
 * POST /api/auth/forgot-password
 *
 * Always answers 200 with the same message, whether or not the address is
 * registered — otherwise this endpoint becomes a way to enumerate which
 * emails have accounts.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const generic =
    "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.";

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) return ok(res, null, generic);

  // Only the newest link should work.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const minutes = env.passwordResetExpiryMinutes;

  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + minutes * 60 * 1000),
      ip: req.ip,
    },
  });

  const result = await sendPasswordReset({
    to: user.email,
    name: user.name,
    resetUrl: `${env.appUrl}/reset-password?token=${token}`,
    expiresMinutes: minutes,
  });

  audit(req, {
    action: "auth.forgot_password",
    entity: "User",
    entityId: user.id,
    meta: { delivered: result.delivered },
  });

  return ok(res, null, generic);
});

/** POST /api/auth/reset-password */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest("This reset link is invalid or has expired. Request a new one.");
  }
  if (!record.user.isActive) throw ApiError.forbidden("This account is deactivated");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Anyone holding a session for this account loses it.
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  sendPasswordChanged({ to: record.user.email, name: record.user.name });

  audit(req, { action: "auth.password_reset", entity: "User", entityId: record.userId });

  return ok(res, null, "Password updated. You can now sign in with your new password.");
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: USER_INCLUDE,
  });
  if (!user) throw ApiError.notFound("User not found");
  return ok(res, publicUser(user));
});

/** PATCH /api/auth/me */
export const updateProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: req.body,
    include: USER_INCLUDE,
  });
  return ok(res, publicUser(user), "Profile updated");
});

/** POST /api/auth/change-password */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest("Current password is incorrect");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    // Every existing session dies, including this one…
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  // …then this device gets a fresh one, so changing your password signs out
  // your other devices without signing you out of the one you're using.
  const tokens = await issueSession(user, req, res);

  sendPasswordChanged({ to: user.email, name: user.name });
  audit(req, { action: "auth.password_change", entity: "User", entityId: user.id });

  return ok(res, tokens, "Password changed. Your other devices have been signed out.");
});
