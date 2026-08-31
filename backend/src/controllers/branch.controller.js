import { prisma, prismaRaw } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { created, ok } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { audit } from "../utils/audit.js";

/**
 * Campuses of one school.
 *
 * A branch is a subdivision *inside* an institute, never a tenant of its own:
 * every query here is already scoped by `req.instituteId`, exactly like students
 * and teachers, so a campus cannot be read or written across schools.
 *
 * The whole feature is opt-in. A school with one campus creates no branches,
 * `branchId` stays null on everybody, and every list behaves as it always did.
 */

/** Counts of who is on a campus, live rows only. */
const withCounts = {
  _count: {
    select: {
      // Nested reads skip the soft-delete extension, so both spell it out.
      students: { where: { deletedAt: null } },
      teachers: { where: { deletedAt: null } },
    },
  },
};

/** GET /api/branches */
export const listBranches = asyncHandler(async (req, res) => {
  const branches = await prisma.branch.findMany({
    where: { instituteId: req.instituteId, deletedAt: null },
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
    include: withCounts,
  });

  return ok(
    res,
    branches.map((b) => ({
      ...b,
      studentCount: b._count.students,
      teacherCount: b._count.teachers,
    })),
    "Branches fetched"
  );
});

/** POST /api/branches */
export const createBranch = asyncHandler(async (req, res) => {
  const { name, code, city, address, phone, isMain } = req.body;

  const clash = await prisma.branch.findFirst({
    where: { instituteId: req.instituteId, code, deletedAt: null },
    select: { name: true },
  });
  if (clash) {
    throw ApiError.conflict(`${clash.name} already uses the code ${code}.`);
  }

  /**
   * Exactly one main campus, or none at all.
   *
   * The main campus is where a student lands when an import or a quick add says
   * nothing about which building they attend. Two of them would make that answer
   * depend on row order, so setting one clears the other in the same
   * transaction rather than after it.
   */
  const branch = await prisma.$transaction(async (tx) => {
    if (isMain) {
      await tx.branch.updateMany({
        where: { instituteId: req.instituteId, isMain: true },
        data: { isMain: false },
      });
    }
    return tx.branch.create({
      data: {
        instituteId: req.instituteId,
        name,
        code,
        city: city ?? null,
        address: address ?? null,
        phone: phone ?? null,
        isMain: Boolean(isMain),
      },
    });
  });

  audit(req, { action: "branch.create", entity: "Branch", entityId: branch.id, meta: { name, code } });
  return created(res, { ...branch, studentCount: 0, teacherCount: 0 }, `${name} added.`);
});

/** PATCH /api/branches/:id */
export const updateBranch = asyncHandler(async (req, res) => {
  const existing = await prisma.branch.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId, deletedAt: null },
  });
  if (!existing) throw ApiError.notFound("Campus not found");

  const { code } = req.body;
  if (code && code !== existing.code) {
    const clash = await prisma.branch.findFirst({
      where: { instituteId: req.instituteId, code, deletedAt: null, NOT: { id: existing.id } },
      select: { name: true },
    });
    if (clash) throw ApiError.conflict(`${clash.name} already uses the code ${code}.`);
  }

  const branch = await prisma.$transaction(async (tx) => {
    if (req.body.isMain) {
      await tx.branch.updateMany({
        where: { instituteId: req.instituteId, isMain: true, NOT: { id: existing.id } },
        data: { isMain: false },
      });
    }
    return tx.branch.update({ where: { id: existing.id }, data: req.body });
  });

  audit(req, { action: "branch.update", entity: "Branch", entityId: branch.id });
  return ok(res, branch, `${branch.name} updated.`);
});

/**
 * DELETE /api/branches/:id
 *
 * Closing a campus does not close the people on it. Their `branchId` goes to
 * null — the schema says SET NULL — so they stay on the school's roll, unassigned,
 * which is the honest state for a student whose building just shut. A school
 * that wanted them gone would remove them, and that is a different button.
 */
export const deleteBranch = asyncHandler(async (req, res) => {
  const branch = await prisma.branch.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId, deletedAt: null },
    include: withCounts,
  });
  if (!branch) throw ApiError.notFound("Campus not found");

  const moved = { students: branch._count.students, teachers: branch._count.teachers };

  await prismaRaw.$transaction(async (tx) => {
    await tx.student.updateMany({ where: { branchId: branch.id }, data: { branchId: null } });
    await tx.teacher.updateMany({ where: { branchId: branch.id }, data: { branchId: null } });
    await tx.branch.update({ where: { id: branch.id }, data: { deletedAt: new Date() } });
  });

  audit(req, {
    action: "branch.delete",
    entity: "Branch",
    entityId: branch.id,
    meta: { name: branch.name, ...moved },
  });
  return ok(
    res,
    moved,
    moved.students || moved.teachers
      ? `${branch.name} closed. Its people stay on the roll, without a campus.`
      : `${branch.name} closed.`
  );
});

/**
 * POST /api/branches/:id/reassign
 *
 * Moving people between campuses. Written as its own endpoint rather than an
 * edit-each-student loop because a school does this a class at a time.
 */
export const reassignToBranch = asyncHandler(async (req, res) => {
  const branch = await prisma.branch.findFirst({
    where: { id: req.params.id, instituteId: req.instituteId, deletedAt: null },
  });
  if (!branch) throw ApiError.notFound("Campus not found");

  const studentIds = req.body.studentIds ?? [];
  const teacherIds = req.body.teacherIds ?? [];
  if (!studentIds.length && !teacherIds.length) {
    throw ApiError.badRequest("Name at least one student or teacher to move.");
  }

  // Scoped by institute as well as id: an id from another school moves nobody.
  const [students, teachers] = await prisma.$transaction([
    prisma.student.updateMany({
      where: { id: { in: studentIds }, instituteId: req.instituteId },
      data: { branchId: branch.id },
    }),
    prisma.teacher.updateMany({
      where: { id: { in: teacherIds }, instituteId: req.instituteId },
      data: { branchId: branch.id },
    }),
  ]);

  audit(req, {
    action: "branch.reassign",
    entity: "Branch",
    entityId: branch.id,
    meta: { students: students.count, teachers: teachers.count },
  });
  return ok(
    res,
    { students: students.count, teachers: teachers.count },
    `Moved to ${branch.name}.`
  );
});
