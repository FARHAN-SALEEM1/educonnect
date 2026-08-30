import { describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * What an error tells the caller.
 *
 * An unrecognised exception used to be repackaged as
 * `ApiError.internal(err.message)`, so whatever the underlying library said
 * went straight into the response — in production. Exception messages are
 * exactly where connection strings, absolute paths and internal hostnames
 * live, so these tests pin two things at once: production says nothing, and
 * development still says everything.
 *
 * The environment is decided at import time, so each mode gets its own module
 * registry and its own tiny app rather than a shared one.
 */

/** Strings that must never reach a production client. */
const SECRETS = [
  "postgresql://admin:hunter2@10.0.0.5:5432/educonnect",
  "10.0.0.5",
  "hunter2",
  "/var/secrets/private.key",
  "ECONNREFUSED",
];

const LEAKY_MESSAGE =
  "connect ECONNREFUSED 10.0.0.5:5432 using postgresql://admin:hunter2@10.0.0.5:5432/educonnect";

/**
 * An express app wired to the real error handler, with the env module faked so
 * `isProd` can be flipped.
 */
const buildApp = async (isProd) => {
  vi.resetModules();
  vi.doMock("../src/config/env.js", () => ({
    env: { isProd, nodeEnv: isProd ? "production" : "development" },
  }));

  const express = (await import("express")).default;
  const { errorHandler, notFoundHandler } = await import("../src/middleware/errorHandler.js");
  const { ApiError } = await import("../src/utils/ApiError.js");
  const { asyncHandler } = await import("../src/utils/asyncHandler.js");
  const { Prisma } = await import("@prisma/client");

  const app = express();
  app.use(express.json());

  app.get("/unexpected", () => { throw new Error(LEAKY_MESSAGE); });
  app.get("/type-error", () => { const x = undefined; return x.nope.deeper; });
  app.get("/fs-error", () => {
    const e = new Error("ENOENT: no such file or directory, open '/var/secrets/private.key'");
    e.code = "ENOENT";
    e.path = "/var/secrets/private.key";
    throw e;
  });
  // Async routes reach the handler through asyncHandler, exactly as the real
  // controllers do — an unwrapped async throw never gets there in Express 4.
  app.get("/rejection", asyncHandler(async () => { throw new Error(LEAKY_MESSAGE); }));
  app.get("/db-rejection", asyncHandler(async () => {
    await Promise.resolve();
    throw new Error(LEAKY_MESSAGE);
  }));

  app.get("/prisma-unknown", () => {
    throw new Prisma.PrismaClientKnownRequestError("internal prisma detail", {
      code: "P2011", clientVersion: "5.22.0", meta: {},
    });
  });
  app.get("/prisma-unique", () => {
    throw new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002", clientVersion: "5.22.0", meta: { target: ["email"] },
    });
  });
  app.get("/prisma-init", () => {
    throw new Prisma.PrismaClientInitializationError(
      `Can't reach database server at ${LEAKY_MESSAGE}`, "5.22.0"
    );
  });

  app.get("/jwt", () => { const e = new Error("jwt malformed"); e.name = "JsonWebTokenError"; throw e; });
  app.get("/jwt-expired", () => { const e = new Error("jwt expired"); e.name = "TokenExpiredError"; throw e; });

  app.get("/bad-request", () => { throw ApiError.badRequest("Grade is required"); });
  app.get("/unauthorized", () => { throw ApiError.unauthorized("Incorrect email or password"); });
  app.get("/forbidden", () => { throw ApiError.forbidden("Your institute is awaiting approval"); });
  app.get("/not-found", () => { throw ApiError.notFound("Student not found"); });
  app.get("/unprocessable", () => {
    throw ApiError.unprocessable("Validation failed", [
      { field: "phone", message: "Phone number must start with 03" },
    ]);
  });
  app.get("/deliberate-500", () => { throw ApiError.internal(`seat sweep failed: ${LEAKY_MESSAGE}`); });

  app.post("/echo", (req, res) => res.json({ ok: true, body: req.body }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

const leaks = (res) => {
  const body = JSON.stringify(res.body);
  return SECRETS.filter((s) => body.includes(s));
};

// ── production ────────────────────────────────────────────────────────
describe("production hides everything unexpected", () => {
  const UNEXPECTED = ["/unexpected", "/type-error", "/fs-error", "/rejection", "/db-rejection"];

  it("answers 500 with a fixed generic message", async () => {
    const app = await buildApp(true);
    for (const path of UNEXPECTED) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(500);
      expect(res.body.message, path).toBe("Internal server error");
      expect(res.body.success, path).toBe(false);
    }
  });

  it("leaks none of the underlying detail", async () => {
    const app = await buildApp(true);
    for (const path of UNEXPECTED) {
      const res = await request(app).get(path);
      expect(leaks(res), `${path} leaked`).toEqual([]);
    }
  });

  it("sends no stack trace", async () => {
    const app = await buildApp(true);
    for (const path of UNEXPECTED) {
      const res = await request(app).get(path);
      expect(res.body.stack, path).toBeUndefined();
      expect(JSON.stringify(res.body), path).not.toMatch(/at \w+ \(/);
    }
  });

  it("hides a 5xx even when the application wrote the message itself", async () => {
    const app = await buildApp(true);
    const res = await request(app).get("/deliberate-500");
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Internal server error");
    expect(leaks(res)).toEqual([]);
  });

  it("hides a database that cannot be reached", async () => {
    const app = await buildApp(true);
    const res = await request(app).get("/prisma-init");
    expect(res.status).toBe(503);
    expect(res.body.message).toBe("Internal server error");
    expect(leaks(res)).toEqual([]);
  });

  it("does not name the database engine on an unrecognised code", async () => {
    const app = await buildApp(true);
    const res = await request(app).get("/prisma-unknown");
    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/P2011|prisma|database/i);
  });

  it("still explains a malformed JSON body", async () => {
    const app = await buildApp(true);
    const res = await request(app)
      .post("/echo").set("Content-Type", "application/json").send("{nope");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Malformed JSON body");
  });
});

describe("production keeps intentional 4xx messages", () => {
  const CASES = [
    ["/bad-request", 400, "Grade is required"],
    ["/unauthorized", 401, "Incorrect email or password"],
    ["/forbidden", 403, "Your institute is awaiting approval"],
    ["/not-found", 404, "Student not found"],
    ["/unprocessable", 422, "Validation failed"],
    ["/jwt", 401, "Invalid token"],
    ["/jwt-expired", 401, "Token expired"],
    ["/prisma-unique", 409, "That email address is already in use"],
  ];

  it("passes each one through unchanged", async () => {
    const app = await buildApp(true);
    for (const [path, status, message] of CASES) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(status);
      expect(res.body.message, path).toBe(message);
    }
  });

  it("keeps field-level validation detail, which describes the caller's input", async () => {
    const app = await buildApp(true);
    const res = await request(app).get("/unprocessable");
    expect(res.body.errors).toEqual([
      { field: "phone", message: "Phone number must start with 03" },
    ]);
  });

  it("still 404s an unknown route", async () => {
    const app = await buildApp(true);
    const res = await request(app).get("/no-such-route");
    expect(res.status).toBe(404);
  });
});

// ── development ───────────────────────────────────────────────────────
describe("development stays debuggable", () => {
  it("reports what actually broke", async () => {
    const app = await buildApp(false);
    const res = await request(app).get("/unexpected");
    expect(res.status).toBe(500);
    expect(res.body.message).toBe(LEAKY_MESSAGE);
  });

  it("includes a stack trace", async () => {
    const app = await buildApp(false);
    const res = await request(app).get("/unexpected");
    expect(typeof res.body.stack).toBe("string");
    expect(res.body.stack).toMatch(/Error:/);
  });

  it("surfaces a real TypeError rather than a generic one", async () => {
    const app = await buildApp(false);
    const res = await request(app).get("/type-error");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/nope/);
  });

  it("names the unrecognised Prisma code", async () => {
    const app = await buildApp(false);
    const res = await request(app).get("/prisma-unknown");
    expect(res.body.message).toBe("Database error (P2011)");
  });

  it("explains an unreachable database", async () => {
    const app = await buildApp(false);
    const res = await request(app).get("/prisma-init");
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/PostgreSQL/i);
  });

  it("agrees with production on intentional 4xx", async () => {
    const app = await buildApp(false);
    const res = await request(app).get("/not-found");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Student not found");
    expect(res.body.stack).toBeUndefined(); // 4xx never carries one
  });
});
