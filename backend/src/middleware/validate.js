import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";

/**
 * Validates and *replaces* the given request part with the parsed result,
 * so downstream handlers get coerced, defaulted, stripped data.
 *
 * Usage: router.post("/", validate(createStudentSchema), handler)
 *        router.get("/", validate(listQuerySchema, "query"), handler)
 */
export const validate =
  (schema, source = "body") =>
  (req, _res, next) => {
    try {
      const parsed = schema.parse(req[source]);

      // `req.query` is a prototype getter that re-parses on each access, so a
      // plain assignment would be lost. Defining an own property shadows it
      // and works the same for body/params.
      Object.defineProperty(req, source, {
        value: parsed,
        writable: true,
        configurable: true,
        enumerable: true,
      });

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join(".") || source,
          message: e.message,
        }));
        return next(ApiError.unprocessable("Validation failed", details));
      }
      next(err);
    }
  };
