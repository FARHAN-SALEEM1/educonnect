import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { audit } from "../utils/audit.js";

/** GET /api/notices */
export const listNotices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { category, search, includeExpired } = req.query;

  // Each condition goes into AND so that multiple OR-groups can coexist —
  // spreading several `OR` keys into one object would silently drop all but
  // the last.
  const and = [];

  if (!includeExpired) {
    and.push({ OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] });
  }

  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { body: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  // Teachers and parents only see notices addressed to them
  // (an empty audience means "everyone").
  //
  // Authors are always included, whoever they addressed. Without that a
  // teacher who posts to "Parents only" watches their own notice vanish from
  // the board the moment they publish it — the success message says one thing
  // and the page says another, and the obvious reading is that it failed.
  // Parents cannot post at all, so for them the extra clause matches nothing.
  if (["TEACHER", "PARENT"].includes(req.user.role)) {
    and.push({
      OR: [
        { audience: { isEmpty: true } },
        { audience: { has: req.user.role } },
        { createdById: req.user.id },
      ],
    });
  }

  const where = {
    ...(req.instituteId && { instituteId: req.instituteId }),
    ...(category && { category }),
    ...(and.length && { AND: and }),
  };

  const [total, notices] = await Promise.all([
    prisma.notice.count({ where }),
    prisma.notice.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        institute: { select: { id: true, name: true } },
      },
    }),
  ]);

  return ok(res, notices, "Notices fetched", pageMeta(total, page, limit));
});

/** GET /api/notices/:id */
export const getNotice = asyncHandler(async (req, res) => {
  const notice = await prisma.notice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
    include: { createdBy: { select: { id: true, name: true, role: true } } },
  });

  if (!notice) throw ApiError.notFound("Notice not found");
  return ok(res, notice);
});

/** POST /api/notices */
export const createNotice = asyncHandler(async (req, res) => {
  const { instituteId: _ignored, ...data } = req.body;

  const notice = await prisma.notice.create({
    data: { ...data, instituteId: req.instituteId, createdById: req.user.id },
    include: { createdBy: { select: { id: true, name: true, role: true } } },
  });

  audit(req, { action: "notice.create", entity: "Notice", entityId: notice.id });
  return created(res, notice, "Notice published");
});

/**
 * POST /api/notices/broadcast — super admin only.
 * Publishes the same notice into every targeted institute. Each institute
 * gets its own row so admins there can edit or delete their copy, and the
 * existing per-institute read rules keep working unchanged.
 */
export const broadcastNotice = asyncHandler(async (req, res) => {
  const { instituteIds, ...data } = req.body;

  const institutes = await prisma.institute.findMany({
    where: {
      status: "ACTIVE",
      ...(instituteIds?.length && { id: { in: instituteIds } }),
    },
    select: { id: true, name: true },
  });

  if (!institutes.length) {
    throw ApiError.badRequest(
      instituteIds?.length
        ? "None of the selected institutes are active"
        : "There are no active institutes to broadcast to"
    );
  }

  await prisma.notice.createMany({
    data: institutes.map((i) => ({
      ...data,
      instituteId: i.id,
      createdById: req.user.id,
    })),
  });

  audit(req, {
    action: "notice.broadcast",
    entity: "Notice",
    meta: { title: data.title, institutes: institutes.length },
  });

  return created(
    res,
    { institutes: institutes.length, names: institutes.map((i) => i.name) },
    `Broadcast published to ${institutes.length} institute(s)`
  );
});

/** PATCH /api/notices/:id */
export const updateNotice = asyncHandler(async (req, res) => {
  const existing = await prisma.notice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Notice not found");

  // A teacher may publish, but may only revise what they published themselves.
  // The notices board shows them the whole institute's notices, so without
  // this an edit request could rewrite the principal's announcement. 403 and
  // not 404 here: they can already see the notice, so hiding it would only
  // confuse. Admins keep editing anything in their own institute.
  if (req.user.role === "TEACHER" && existing.createdById !== req.user.id) {
    throw ApiError.forbidden("You can only edit notices you posted yourself");
  }

  const { instituteId: _ignored, ...data } = req.body;

  const notice = await prisma.notice.update({
    where: { id: existing.id },
    data,
    include: { createdBy: { select: { id: true, name: true, role: true } } },
  });

  return ok(res, notice, "Notice updated");
});

/** DELETE /api/notices/:id */
export const deleteNotice = asyncHandler(async (req, res) => {
  const existing = await prisma.notice.findFirst({
    where: { id: req.params.id, ...(req.instituteId && { instituteId: req.instituteId }) },
  });
  if (!existing) throw ApiError.notFound("Notice not found");

  await prisma.notice.delete({ where: { id: existing.id } });
  return ok(res, null, "Notice deleted");
});
