import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      role: user.role,
      instituteId: user.instituteId ?? null,
      email: user.email,
    },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpires }
  );

/**
 * `jti` makes every refresh token unique. Without it two logins for the same
 * user inside one second produce byte-identical JWTs (same payload, same
 * second-granularity `iat`), so the stored hash collides and the second login
 * fails on the tokenHash unique constraint.
 */
export const signRefreshToken = (user) =>
  jwt.sign(
    { sub: user.id, type: "refresh", jti: crypto.randomUUID() },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpires }
  );

export const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret);

export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);

/** Refresh tokens are stored hashed so a leaked DB can't be replayed. */
export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

/**
 * Cookie options for the refresh token.
 *
 * httpOnly keeps it out of reach of JavaScript, so an XSS bug can't steal a
 * long-lived session the way it could from localStorage. It is scoped to the
 * auth routes because nothing else ever needs to send it.
 */
export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd || env.cookie.crossSite,
  sameSite: env.cookie.crossSite ? "none" : "lax",
  path: "/api/auth",
  maxAge: expiryDate(env.jwt.refreshExpires).getTime() - Date.now(),
  ...(env.cookie.domain && { domain: env.cookie.domain }),
});

/** Turns "7d" / "15m" / "30s" into a future Date. */
export const expiryDate = (span) => {
  const match = /^(\d+)([smhd])$/.exec(span);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [, amount, unit] = match;
  const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  return new Date(Date.now() + Number(amount) * ms);
};
