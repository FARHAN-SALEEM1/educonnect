import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { ApiError } from "./utils/ApiError.js";
import { generalLimiter, webhookLimiter } from "./middleware/rateLimit.js";
import { handleWebhook as billingWebhook } from "./controllers/billing.controller.js";

const app = express();

// Behind a proxy (Railway/Render/Nginx) so req.ip and rate limiting see the
// real client address.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, Postman, mobile) which send no Origin.
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin) || env.corsOrigins.includes("*")) {
        return callback(null, true);
      }
      // An ApiError, not a bare Error — a blocked origin is a 403, not a
      // server fault, and shouldn't log a stack trace on every attempt.
      callback(ApiError.forbidden(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(compression());

/**
 * The payment webhook, mounted deliberately early.
 *
 * Signature verification is computed over the exact bytes the gateway signed.
 * Once `express.json()` has parsed and re-serialised the body, key order and
 * whitespace differ and every signature fails — with an error that points at
 * cryptography rather than at middleware ordering, which is a genuinely
 * horrible afternoon. So this route takes the raw buffer and is registered
 * above the JSON parser.
 *
 * It also sits above `generalLimiter`: gateways retry failed deliveries
 * aggressively, and rate-limiting those retries would turn a transient blip
 * into permanently lost payment confirmations.
 *
 * `webhookLimiter` is the exception, and only because it counts failures.
 * Genuine deliveries verify, answer 2xx and are never counted, so the
 * gateway's own address keeps a whole budget however hard it retries. Forged
 * requests — otherwise unlimited, and each costing a full-body HMAC — are
 * capped against the address they come from.
 */
app.post(
  "/api/billing/webhook/:provider",
  webhookLimiter,
  express.raw({ type: "*/*", limit: "1mb" }),
  (req, res, next) => billingWebhook(req, res, next)
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.isProd ? "combined" : "dev"));
app.use("/api", generalLimiter);

/**
 * Liveness + readiness. The database round-trip matters: without it the
 * process reports healthy while Postgres is down, and the platform keeps
 * routing traffic to an instance that can't serve a single request.
 */
app.get("/health", async (_req, res) => {
  const started = Date.now();
  let database = "up";
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    database = "down";
    ok = false;
    console.error("[health] database check failed:", err.message);
  }

  res.status(ok ? 200 : 503).json({
    success: ok,
    status: ok ? "ok" : "degraded",
    service: "educonnect-api",
    environment: env.nodeEnv,
    database,
    latencyMs: Date.now() - started,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
