import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/jwt.js";

/**
 * Verifies the Bearer token and attaches the live user record to req.user.
 * We re-read the user each request so a deactivated account loses access
 * immediately rather than when its token happens to expire.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) throw ApiError.unauthorized("No access token provided");

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw ApiError.unauthorized("Access token expired");
    }
    throw ApiError.unauthorized("Invalid access token");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      instituteId: true,
      isActive: true,
      teacher: { select: { id: true } },
      parent: { select: { id: true } },
    },
  });

  if (!user) throw ApiError.unauthorized("Account no longer exists");
  if (!user.isActive) throw ApiError.forbidden("Your account has been deactivated");

  // Institute-scoped users lose access if their institute is suspended.
  if (user.instituteId) {
    const institute = await prisma.institute.findUnique({
      where: { id: user.instituteId },
      select: { status: true, name: true },
    });
    if (!institute) throw ApiError.forbidden("Your institute no longer exists");
    if (institute.status === "SUSPENDED" || institute.status === "CANCELLED") {
      throw ApiError.forbidden(
        `Access blocked — ${institute.name} is currently ${institute.status.toLowerCase()}`
      );
    }
  }

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    instituteId: user.instituteId,
    teacherId: user.teacher?.id ?? null,
    parentId: user.parent?.id ?? null,
  };

  next();
});

/** Restricts a route to the given roles. Use after `authenticate`. */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`This action requires one of: ${roles.join(", ").toLowerCase()}`)
      );
    }
    next();
  };

/**
 * Resolves which institute the request operates on and puts it on
 * req.instituteId.
 *
 * - SUPERADMIN may target any institute via ?instituteId= (or none, to
 *   query across the whole platform).
 * - Everyone else is pinned to their own institute; an attempt to pass a
 *   different instituteId is rejected rather than silently ignored.
 */
export const scopeToInstitute = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());

  const requested = req.query.instituteId || req.body?.instituteId || null;

  if (req.user.role === "SUPERADMIN") {
    req.instituteId = requested || null;
    return next();
  }

  if (!req.user.instituteId) {
    return next(ApiError.forbidden("Your account is not linked to any institute"));
  }

  if (requested && requested !== req.user.instituteId) {
    return next(ApiError.forbidden("You cannot access another institute's data"));
  }

  req.instituteId = req.user.instituteId;
  next();
};

/**
 * Same as scopeToInstitute but the institute is mandatory — for write
 * routes where a null scope would mean "no tenant", which is never valid.
 */
export const requireInstitute = (req, res, next) =>
  scopeToInstitute(req, res, (err) => {
    if (err) return next(err);
    if (!req.instituteId) {
      return next(
        ApiError.badRequest(
          "instituteId is required (super admins must specify which institute to act on)"
        )
      );
    }
    next();
  });
