import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/** Translates Prisma's error codes into human-readable API errors. */
const fromPrisma = (err) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const fields = err.meta?.target;
        const label = Array.isArray(fields) ? fields.join(", ") : fields || "field";
        return ApiError.conflict(`A record with this ${label} already exists`);
      }
      case "P2003":
        return ApiError.badRequest("Related record does not exist");
      case "P2025":
        return ApiError.notFound(err.meta?.cause || "Record not found");
      case "P2014":
        return ApiError.badRequest("This change would break a required relation");
      default:
        return new ApiError(400, `Database error (${err.code})`);
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return ApiError.badRequest("Invalid data sent to the database");
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new ApiError(503, "Cannot reach the database. Is PostgreSQL running?");
  }
  return null;
};

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export const errorHandler = (err, req, res, _next) => {
  let error = err instanceof ApiError ? err : fromPrisma(err);

  if (!error) {
    if (err.name === "JsonWebTokenError") error = ApiError.unauthorized("Invalid token");
    else if (err.name === "TokenExpiredError") error = ApiError.unauthorized("Token expired");
    else if (err.type === "entity.parse.failed") error = ApiError.badRequest("Malformed JSON body");
    else error = ApiError.internal(err.message || "Unexpected server error");
  }

  if (!error.isOperational || error.statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.details && { errors: error.details }),
    ...(!env.isProd && error.statusCode >= 500 && { stack: err.stack }),
  });
};
