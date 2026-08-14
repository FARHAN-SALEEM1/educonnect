import { prisma, prismaRaw } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { nextParentCode } from "../utils/codes.js";
import crypto from "node:crypto";
import { hashPassword } from "../utils/password.js";
import { audit } from "../utils/audit.js";
import { emailEnabled, sendWelcome } from "../services/email.service.js";
import { notificationEnabled } from "../utils/notifications.js";
import { attendanceSummary, averageScore, calculateGpa } from "../utils/academics.js";

/** GET /api/parents */
export const listParents = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search } = req.query;

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [total, parents] = await Promise.all([
    prisma.parent.count({ where }),
    prisma.parent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
      include: {
        students: { select: { id: true, name: true, grade: true, section: true, rollNo: true } },
        user: { select: { id: true, email: true, isActive: true, lastLoginAt: true } },
        institute: { select: { id: true, name: true } },
      },
    }),
  ]);

  return ok(
    res,
    parents.map((p) => ({ ...p, childrenCount: p.students.length })),
    "Parents fetched",
    pageMeta(total, page, limit)
  );
});

/** GET /api/parents/:id */
export const getParent = asyncHandler(async (req, res) => {
  const parent = await prisma.parent.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: {
      students: {
        include: {
          enrollments: { select: { currentScore: true } },
          feeInvoices: { where: { status: { in: ["PENDING", "OVERDUE"] } } },
        },
      },
      user: { select: { id: true, email: true, isActive: true, lastLoginAt: true } },
      institute: { select: { id: true, name: true, code: true } },
    },
  });

  if (!parent) throw ApiError.notFound("Parent not found");

  return ok(res, {
    ...parent,
    students: parent.students.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      grade: s.grade,
      section: s.section,
      rollNo: s.rollNo,
      gpa: calculateGpa(s.enrollments),
      average: averageScore(s.enrollments),
      duesOutstanding: s.feeInvoices.reduce((sum, f) => sum + f.amount, 0),
      enrollments: undefined,
      feeInvoices: undefined,
    })),
  });
});

/**
 * GET /api/parents/me/children
 * Landing data for the parent portal: every child with the headline
 * numbers, so the portal can render before drilling into one student.
 */
export const myChildren = asyncHandler(async (req, res) => {
  if (!req.user.parentId) throw ApiError.forbidden("No parent profile linked to your account");

  const students = await prisma.student.findMany({
    where: { parentId: req.user.parentId },
    include: {
      enrollments: { include: { subject: { select: { name: true, color: true } } } },
      feeInvoices: { orderBy: { period: "desc" } },
      institute: { select: { id: true, name: true, logo: true, color: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = await Promise.all(
    students.map(async (s) => {
      const attendance = await prisma.attendance.findMany({
        where: { studentId: s.id },
        select: { status: true },
      });

      const outstanding = s.feeInvoices
        .filter((f) => f.status === "PENDING" || f.status === "OVERDUE")
        .reduce((sum, f) => sum + (f.amount - f.discount + f.lateFee), 0);

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        grade: s.grade,
        section: s.section,
        rollNo: s.rollNo,
        photoUrl: s.photoUrl,
        institute: s.institute,
        gpa: calculateGpa(s.enrollments),
        average: averageScore(s.enrollments),
        subjectCount: s.enrollments.length,
        attendance: attendanceSummary(attendance),
        duesOutstanding: outstanding,
        nextDue: s.feeInvoices.find((f) => f.status === "PENDING" || f.status === "OVERDUE") ?? null,
      };
    })
  );

  return ok(res, data);
});

/** POST /api/parents */
export const createParent = asyncHandler(async (req, res) => {
  const { createLogin = true, password, studentIds, instituteId: _ignored, ...data } = req.body;
  const instituteId = req.instituteId;

  if (createLogin) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw ApiError.conflict("A user with this email already exists");
  }

  const code = await nextParentCode(instituteId);
  const tempPassword = password || `EC-${crypto.randomBytes(4).toString("hex")}`;

  const parent = await prisma.$transaction(async (tx) => {
    let userId = null;

    if (createLogin) {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          passwordHash: await hashPassword(tempPassword),
          role: "PARENT",
          instituteId,
        },
      });
      userId = user.id;
    }

    const record = await tx.parent.create({ data: { ...data, code, instituteId, userId } });

    if (studentIds?.length) {
      await tx.student.updateMany({
        where: { id: { in: studentIds }, instituteId },
        data: { parentId: record.id },
      });
    }

    return record;
  });

  audit(req, { action: "parent.create", entity: "Parent", entityId: parent.id });

  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: { name: true, notificationSettings: true },
  });

  // Honours the "Welcome emails" toggle rather than always sending.
  if (createLogin && !password && notificationEnabled(institute, "welcomeEmails")) {
    await sendWelcome({
      to: parent.email,
      name: parent.name,
      role: "parent",
      instituteName: institute?.name ?? "EduConnect",
      tempPassword,
      loginUrl: `${env.appUrl}/`,
    });
  }

  return created(
    res,
    { ...parent, emailed: createLogin && !password && emailEnabled() },
    !createLogin
      ? `${parent.name} added`
      : password
        ? `${parent.name} added with the password you set.`
        : emailEnabled()
          ? `${parent.name} added — sign-in details sent to ${parent.email}.`
          : `${parent.name} added. Temporary password: ${tempPassword} (no mail server configured).`
  );
});

/** PATCH /api/parents/:id */
export const updateParent = asyncHandler(async (req, res) => {
  const existing = await prisma.parent.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Parent not found");

  const { studentIds, password, instituteId: _ignored, ...data } = req.body;

  const parent = await prisma.$transaction(async (tx) => {
    const record = await tx.parent.update({ where: { id: existing.id }, data });

    if (existing.userId && (data.name || data.email || data.phone !== undefined)) {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.email && { email: data.email }),
          ...(data.phone !== undefined && { phone: data.phone }),
        },
      });
    }

    if (studentIds) {
      await tx.student.updateMany({ where: { parentId: existing.id }, data: { parentId: null } });
      if (studentIds.length) {
        await tx.student.updateMany({
          where: { id: { in: studentIds }, instituteId: existing.instituteId },
          data: { parentId: existing.id },
        });
      }
    }

    return record;
  });

  audit(req, { action: "parent.update", entity: "Parent", entityId: parent.id });
  return ok(res, parent, "Parent updated");
});

/** DELETE /api/parents/:id */
export const deleteParent = asyncHandler(async (req, res) => {
  const parent = await prisma.parent.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!parent) throw ApiError.notFound("Parent not found");

  await prisma.$transaction(async (tx) => {
    // Children stay enrolled; they simply lose the guardian link.
    await tx.student.updateMany({ where: { parentId: parent.id }, data: { parentId: null } });
    await tx.parent.update({ where: { id: parent.id }, data: { deletedAt: new Date() } });
    if (parent.userId) {
      await tx.user.update({ where: { id: parent.userId }, data: { isActive: false } });
    }
  });

  audit(req, {
    action: "parent.delete",
    entity: "Parent",
    entityId: parent.id,
    meta: { name: parent.name, soft: true },
  });

  return ok(res, null, `${parent.name} removed. Their children remain enrolled.`);
});

/** GET /api/parents/deleted */
export const listDeletedParents = asyncHandler(async (req, res) => {
  const parents = await prismaRaw.parent.findMany({
    where: { instituteId: req.instituteId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: { id: true, code: true, name: true, email: true, deletedAt: true },
  });
  return ok(res, parents);
});

/** POST /api/parents/:id/restore */
export const restoreParent = asyncHandler(async (req, res) => {
  const parent = await prismaRaw.parent.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId },
  });

  if (!parent) throw ApiError.notFound("Parent not found");
  if (!parent.deletedAt) throw ApiError.badRequest("That parent is not deleted");

  await prismaRaw.$transaction(async (tx) => {
    await tx.parent.update({ where: { id: parent.id }, data: { deletedAt: null } });
    if (parent.userId) {
      await tx.user.update({ where: { id: parent.userId }, data: { isActive: true } });
    }
  });

  audit(req, { action: "parent.restore", entity: "Parent", entityId: parent.id });
  return ok(res, null, `${parent.name} restored. Re-link their children as needed.`);
});
