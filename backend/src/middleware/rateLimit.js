import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const handler = (_req, res) => {
  res.status(429).json({
    success: false,
    message: "Too many requests — please slow down and try again shortly.",
  });
};

export const generalLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/** Tighter budget on login/register to blunt credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler,
});
