import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * What a production client is told when something unexpected breaks.
 *
 * Deliberately says nothing. The detail still exists — it goes to the server
 * log, where it belongs — but a raw exception message is exactly where
 * connection strings, absolute file paths, internal hostnames and library
 * internals surface, and none of that is the caller's business.
 */
const GENERIC_MESSAGE = "Internal server error";

/**
 * Translates Prisma's error codes into human-readable API errors.
 *
 * The specific cases are intentional, user-facing 4xx messages and read the
 * same in every environment — a caller genuinely needs to know a uniqueness
 * constraint was hit. Only the unrecognised fallback varies, because a bare
 * `P20xx` code tells the caller nothing and tells an attacker which engine
 * sits behind the API.
 */
const fromPrisma = (err) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      /**
       * A unique constraint, said in words a school uses.
       *
       * This joined the raw column names, so a duplicate roll number came back
       * as "A record with this instituteId, rollNo already exists" — which
       * names an internal field, mentions a tenant column that is implicit in
       * every one of these tables, and never says which value clashed.
       */
      case "P2002": {
        const raw = err.meta?.target;
        const fields = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
        const HUMAN = {
          rollNo: "roll number",
          code: "code",
          email: "email address",
          name: "name",
          period: "period",
          sequence: "order",
        };
        const named = fields
          .filter((f) => f !== "instituteId" && HUMAN[f])
          .map((f) => HUMAN[f]);
        return ApiError.conflict(
          named.length ? `That ${named.join(" and ")} is already in use` : "That already exists"
        );
      }
      case "P2003":
        return ApiError.badRequest("Related record does not exist");
      case "P2025":
        return ApiError.notFound(err.meta?.cause || "Record not found");
      case "P2014":
        return ApiError.badRequest("This change would break a required relation");
      default:
        return ApiError.badRequest(
          env.isProd ? "That request could not be completed" : `Database error (${err.code})`
        );
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return ApiError.badRequest("Invalid data sent to the database");
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    // 5xx, so the message below is replaced in production anyway; the detail
    // is kept for development, where "is Postgres running?" is the answer.
    return new ApiError(503, "Cannot reach the database. Is PostgreSQL running?");
  }
  return null;
};

/** Errors thrown by libraries we can name precisely and answer safely. */
const fromWellKnown = (err) => {
  if (err?.name === "JsonWebTokenError") return ApiError.unauthorized("Invalid token");
  if (err?.name === "TokenExpiredError") return ApiError.unauthorized("Token expired");
  if (err?.type === "entity.parse.failed") return ApiError.badRequest("Malformed JSON body");
  return null;
};

/**
 * Turns anything thrown into a response.
 *
 * The rule that matters: **in production no 5xx ever carries a message the
 * application didn't choose.** Previously an unrecognised exception was
 * repackaged as `ApiError.internal(err.message)`, so whatever the underlying
 * library happened to say — a DSN, a path, a socket address — was serialised
 * straight to the caller. Deliberate 4xx messages are untouched, in every
 * environment, because those are the API's contract.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export const errorHandler = (err, req, res, _next) => {
  const translated =
    err instanceof ApiError ? err : (fromPrisma(err) ?? fromWellKnown(err));

  // Nothing recognised it: a bug, a driver failure, a filesystem error.
  const unexpected = !translated;
  const error = translated ?? ApiError.internal(GENERIC_MESSAGE);

  // The detail is never lost — it is written here, in full, with the request
  // that caused it, whatever the client is eventually told.
  if (unexpected || error.statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const hideDetail = env.isProd && error.statusCode >= 500;
  const message = hideDetail
    ? GENERIC_MESSAGE
    : unexpected
      ? err?.message || GENERIC_MESSAGE // development: say what actually broke
      : error.message;

  res.status(error.statusCode).json({
    success: false,
    message,
    // Field-level validation detail is intentional and safe; it describes the
    // caller's own input, never the server's internals.
    ...(error.details && { errors: error.details }),
    ...(!env.isProd && error.statusCode >= 500 && { stack: err?.stack }),
  });
};
