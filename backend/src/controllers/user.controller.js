import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import crypto from "node:crypto";
import { hashPassword } from "../utils/password.js";
import { hashToken } from "../utils/jwt.js";
import { audit } from "../utils/audit.js";
import { sendPasswordReset, sendWelcome, notSent, undeliveredReason } from "../services/email.service.js";

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  instituteId: true,
  institute: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, code: true } },
  parent: { select: { id: true, code: true } },
};

/** GET /api/users */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, role, isActive } = req.query;

  const where = {
    // Admins see only their own institute's users; super admins see all.
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(role && { role }),
    ...(isActive !== undefined && { isActive: isActive === "true" }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: SAFE_SELECT,
    }),
  ]);

  return ok(res, users, "Users fetched", pageMeta(total, page, limit));
});

/** GET /api/users/:id */
export const getUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    select: SAFE_SELECT,
  });

  if (!user) throw ApiError.notFound("User not found");
  return ok(res, user);
});

/** POST /api/users */
export const createUser = asyncHandler(async (req, res) => {
  const { password, role, instituteId: bodyInstituteId, ...data } = req.body;

  // Only the platform owner can mint another platform owner.
  if (role === "SUPERADMIN" && req.user.role !== "SUPERADMIN") {
    throw ApiError.forbidden("Only a super admin can create another super admin");
  }

  const instituteId =
    req.user.role === "SUPERADMIN" ? (bodyInstituteId ?? null) : req.user.instituteId;

  if (role !== "SUPERADMIN" && !instituteId) {
    throw ApiError.badRequest("instituteId is required for non-superadmin users");
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw ApiError.conflict("A user with this email already exists");

  const tempPassword = password || `EC-${crypto.randomBytes(4).toString("hex")}`;

  const user = await prisma.user.create({
    data: {
      ...data,
      role,
      instituteId: role === "SUPERADMIN" ? null : instituteId,
      passwordHash: await hashPassword(tempPassword),
    },
    select: SAFE_SELECT,
  });

  audit(req, { action: "user.create", entity: "User", entityId: user.id, meta: { role } });

  // Kept, not discarded: if the welcome mail did not land, the generated
  // password has to appear on screen or the account is unreachable.
  const delivery = password
    ? notSent("not-applicable")
    : await sendWelcome({
        to: user.email,
        name: user.name,
        role: role.toLowerCase(),
        instituteName: user.institute?.name ?? "EduConnect",
        tempPassword,
        loginUrl: `${env.appUrl}/`,
      });

  return created(
    res,
    { ...user, emailed: delivery.delivered },
    password
      ? `${user.name} created.`
      : delivery.delivered
        ? `${user.name} created — sign-in details sent to ${user.email}.`
        : `${user.name} created. Temporary password: ${tempPassword} (${undeliveredReason(delivery.reason)}).`
  );
});

/** PATCH /api/users/:id */
export const updateUser = asyncHandler(async (req, res) => {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("User not found");

  if (req.body.role && req.body.role !== existing.role && req.user.role !== "SUPERADMIN") {
    throw ApiError.forbidden("Only a super admin can change a user's role");
  }

  // Don't let someone lock themselves out.
  if (existing.id === req.user.id && req.body.isActive === false) {
    throw ApiError.badRequest("You cannot deactivate your own account");
  }

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: req.body,
    select: SAFE_SELECT,
  });

  audit(req, { action: "user.update", entity: "User", entityId: user.id });
  return ok(res, user, "User updated");
});

/**
 * POST /api/users/:id/reset-password — admin-forced reset.
 *
 * Sends the user a single-use reset link rather than minting a password.
 *
 * The old behaviour generated a password and, with no mail server, returned it
 * in the response body — where it passed through the admin's browser, any
 * proxy in between, and onto the screen. It also meant a working credential
 * existed that neither party had chosen. A reset link is strictly better: it
 * expires, it can only be used once, and the password is chosen by its owner
 * and never transits at all.
 *
 * The account is locked out immediately either way — every session is revoked
 * here, so a compromised account stops being usable the moment an admin acts,
 * without waiting for the user to follow the link.
 *
 * Nothing secret is ever returned. Without SMTP the link is written to the
 * server console by the mail service, which is a development affordance;
 * production refuses to start without SMTP configured.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { institute: { select: { name: true } } },
  });
  if (!existing) throw ApiError.notFound("User not found");

  const token = crypto.randomBytes(32).toString("hex");
  const minutes = env.passwordResetExpiryMinutes;

  await prisma.$transaction([
    // Supersede any link already outstanding, so only the newest one works.
    prisma.passwordResetToken.updateMany({
      where: { userId: existing.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: existing.id,
        expiresAt: new Date(Date.now() + minutes * 60 * 1000),
        ip: req.ip,
      },
    }),
    // Lock the account out now rather than when the link is followed.
    prisma.refreshToken.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  const delivery = await sendPasswordReset({
    to: existing.email,
    name: existing.name,
    resetUrl: `${env.appUrl}/reset-password?token=${token}`,
    expiresMinutes: minutes,
  });

  audit(req, {
    action: "user.reset_password",
    entity: "User",
    entityId: existing.id,
    meta: { delivered: delivery.delivered },
  });

  return ok(
    res,
    { email: existing.email, emailed: delivery.delivered, expiresMinutes: minutes },
    delivery.delivered
      ? `Reset link sent to ${existing.email}. They have been signed out everywhere and the link expires in ${minutes} minutes.`
      : `${existing.name} has been signed out everywhere. No mail server is configured, so the reset link was written to the server log.`
  );
});

/** DELETE /api/users/:id */
export const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    throw ApiError.badRequest("You cannot delete your own account");
  }

  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("User not found");

  await prisma.user.delete({ where: { id: existing.id } });

  audit(req, {
    action: "user.delete",
    entity: "User",
    entityId: existing.id,
    meta: { email: existing.email },
  });

  return ok(res, null, `${existing.name} deleted`);
});

/** GET /api/audit-logs — recent activity feed. */
export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, 50);
  const { action, entity, userId } = req.query;

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(action && { action: { contains: action } }),
    ...(entity && { entity }),
    ...(userId && { userId }),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, role: true } } },
    }),
  ]);

  return ok(res, logs, "Audit logs fetched", pageMeta(total, page, limit));
});
