import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import crypto from "node:crypto";
import { hashPassword } from "../utils/password.js";
import { audit } from "../utils/audit.js";
import { emailEnabled, sendWelcome } from "../services/email.service.js";

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
      orderBy: { createdAt: "desc" },
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

  if (!password) {
    await sendWelcome({
      to: user.email,
      name: user.name,
      role: role.toLowerCase(),
      instituteName: user.institute?.name ?? "EduConnect",
      tempPassword,
      loginUrl: `${env.appUrl}/`,
    });
  }

  return created(
    res,
    { ...user, emailed: !password && emailEnabled() },
    password
      ? `${user.name} created.`
      : emailEnabled()
        ? `${user.name} created — sign-in details sent to ${user.email}.`
        : `${user.name} created. Temporary password: ${tempPassword} (no mail server configured).`
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
 * When email is configured the new password is sent to the user and never
 * returned by the API, so it stays out of response bodies, browser memory and
 * proxy logs. Without SMTP the API returns it once, because otherwise an admin
 * in a school with no mail server has no way to get the user back in — but it
 * says plainly that this is the fallback.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { institute: { select: { name: true } } },
  });
  if (!existing) throw ApiError.notFound("User not found");

  // A random password beats a shared default that everyone in the school knows.
  const newPassword = req.body?.password || `EC-${crypto.randomBytes(4).toString("hex")}`;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  audit(req, { action: "user.reset_password", entity: "User", entityId: existing.id });

  if (emailEnabled()) {
    await sendWelcome({
      to: existing.email,
      name: existing.name,
      role: existing.role.toLowerCase(),
      instituteName: existing.institute?.name ?? "EduConnect",
      tempPassword: newPassword,
      loginUrl: `${env.appUrl}/`,
    });
    return ok(
      res,
      { email: existing.email, emailed: true },
      `New password sent to ${existing.email}. They have been signed out everywhere.`
    );
  }

  return ok(
    res,
    { email: existing.email, password: newPassword, emailed: false },
    `Password reset for ${existing.name}: ${newPassword} — no mail server is configured, so share this securely and ask them to change it.`
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
