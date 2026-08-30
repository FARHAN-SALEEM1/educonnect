import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok } from "../utils/response.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { PLAN_PUBLIC } from "../utils/publicFields.js";
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
import { defaultSpan } from "../services/session.service.js";
import { sendPasswordChanged, sendPasswordReset } from "../services/email.service.js";
import { accessBlock } from "../utils/subscription.js";
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
 * The refresh token goes into an httpOnly cookie and is returned **nowhere
 * else**. The cookie is the only channel, in both directions: JavaScript
 * cannot read it, so an XSS bug cannot lift a long-lived session. Only the
 * short-lived access token comes back in the body, for the client to hold in
 * memory.
 *
 * There used to be an opt-out — `?tokenInBody=1` — meant for clients with no
 * cookie jar. Because it was a plain query parameter, injected script could
 * ask for it too: one `fetch("/api/auth/refresh?tokenInBody=1", {credentials:
 * "include"})` handed the attacker a seven-day credential and the httpOnly
 * cookie became decorative. A real non-browser client needs a deliberate
 * auth flow, not a switch any caller can flip, so the opt-out is gone rather
 * than merely restricted.
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

  return { accessToken };
};

/**
 * The refresh token, from the httpOnly cookie and nowhere else.
 *
 * The body was accepted here as the inbound half of the opt-out above. With
 * nothing ever handing a token out, no legitimate caller can put one in a
 * body — and accepting one would let a token leaked by any other route be
 * replayed from any origin, sidestepping the cookie's SameSite protection.
 */
const readRefreshToken = (req) => req.cookies?.[env.cookie.name] || null;

const clearRefreshCookie = (res) => {
  const { maxAge: _ignored, ...options } = refreshCookieOptions();
  res.clearCookie(env.cookie.name, options);
};

const USER_INCLUDE = {
  institute: { include: { plan: { select: PLAN_PUBLIC } } },
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

  // Exactly the same rule as the per-request check in middleware/auth.js, so
  // a user sees one consistent explanation whether logging in or already in.
  if (user.institute) {
    const block = accessBlock(user.institute);
    if (block) throw ApiError.forbidden(block.message);
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
    sessionStartMonth, passingPercentage, terms,
  } = req.body;

  /**
   * A term list with two entries called the same thing is not a year.
   * Caught here rather than at the unique constraint, so the school is told
   * which name it repeated instead of being handed a database error.
   */
  const wanted = terms?.map((t) => t.trim()).filter(Boolean) ?? null;
  if (wanted) {
    const seen = new Set();
    for (const t of wanted) {
      const key = t.toLowerCase();
      if (seen.has(key)) throw ApiError.badRequest(`Two terms are both called "${t}"`);
      seen.add(key);
    }
  }

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
        // Only written when the school said something; a school that did not
        // gets the platform default, exactly as before.
        ...(passingPercentage !== undefined && {
          gradingSettings: { passingPercentage },
        }),
        // New signups start PENDING; a super admin activates them.
        status: "PENDING",
        trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
      },
      include: { plan: { select: PLAN_PUBLIC } },
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

    /**
     * The school's first academic year, created with the school.
     *
     * A session that only appears when somebody opens Settings would mean every
     * list and every card had to be prepared to create one — and a read that can
     * write is a read that serialises. Making it at birth keeps every later
     * lookup a plain read.
     */
    // April unless the school said otherwise — Karachi and Cambridge-track
    // schools commonly run August to July, and that is not a platform choice.
    const span = defaultSpan(institute.currentSession, sessionStartMonth ?? 4);
    if (span) {
      const session = await tx.academicSession.create({
        data: { instituteId: institute.id, name: institute.currentSession, ...span, isCurrent: true },
      });

      /**
       * The year's terms, named by the school at the point it is asked.
       *
       * Created here rather than left to `ensureTerms` so a school that runs
       * two terms never has three defaults appear and have to be cleaned up.
       * Unweighted: a share is a policy the school states deliberately, and
       * signup is not the place to hold it to one.
       */
      if (wanted?.length) {
        await tx.examTerm.createMany({
          data: wanted.map((termName, i) => ({
            academicSessionId: session.id,
            name: termName,
            sequence: i + 1,
          })),
        });
      }
    }

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

  /**
   * Reuse detection.
   *
   * Rotation means a token is revoked the moment it is exchanged, so a
   * *revoked but not expired* token being presented again has only two
   * explanations: the legitimate client replayed one it should have discarded,
   * or someone else is holding a copy. Both mean the family can no longer be
   * trusted, so every live session for that account is revoked and whoever it
   * was has to sign in again with the password.
   *
   * This is why the maintenance sweep keeps revoked rows for a week rather
   * than deleting them on revocation — without the row, a stolen token is
   * indistinguishable from a made-up one and the theft is invisible.
   */
  if (stored?.revokedAt && stored.expiresAt >= new Date()) {
    const { count } = await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    console.warn(
      `[security] refresh token reuse for user ${stored.userId} from ${req.ip} — ` +
        `revoked ${count} live session(s)`
    );
    audit(req, {
      action: "auth.refresh_reuse",
      entity: "User",
      entityId: stored.userId,
      meta: { revokedSessions: count, userAgent: req.headers["user-agent"]?.slice(0, 240) ?? null },
    });

    clearRefreshCookie(res);
    throw ApiError.unauthorized(
      "This session has been ended for security. Please sign in again."
    );
  }

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
