import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

/**
 * Rate limiting, in two layers.
 *
 * Keying everything on IP has a flaw that matters here: a school reaches the
 * API through one public address, so an IP budget is shared by every teacher,
 * parent and admin at that school simultaneously. Set it tight enough to stop
 * credential stuffing and a busy Monday morning locks the school out; set it
 * loose enough for the school and it stops nothing.
 *
 * So the two jobs are separated:
 *
 *   • **Per IP** — generous. A blunt ceiling on absolute traffic from one
 *     address. On the auth routes it counts *failures only*, so a school's
 *     successful logins never move it at all.
 *
 *   • **Per identity** — tight. Keyed on the email being attacked, or on the
 *     signed-in user, so it doesn't matter how many addresses an attacker
 *     spreads across: a single account still only absorbs a handful of wrong
 *     passwords per window. This is the control that actually blunts
 *     credential stuffing, and it costs a legitimate user nothing, because a
 *     legitimate user does not fail ten times in a row.
 *
 * ── Known limitation ────────────────────────────────────────────────────
 * These counters live in this process's memory. They reset when the server
 * restarts, and a multi-instance deployment would get one budget per instance.
 * That is a deliberate trade for this deployment: render.yaml runs a single
 * web service, and a shared store means adding Redis — a whole external
 * dependency to pay for, operate and monitor.
 *
 * If this ever runs on more than one instance, this file is the thing to
 * change: give each limiter a shared `store`. The durable upgrade is a
 * per-account attempt counter in Postgres, which would survive restarts and
 * be shared across instances without any new infrastructure — that needs a
 * schema change, so it is deliberately not done here.
 */

/** Seconds until this limiter's window rolls over, for the client to honour. */
const retryAfterSeconds = (req) => {
  const reset = req.rateLimit?.resetTime;
  if (!reset) return Math.ceil(env.rateLimit.windowMs / 1000);
  return Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000));
};

/**
 * A 429 that says how long to wait.
 *
 * `Retry-After` and the `RateLimit-*` headers are set by the library before
 * this runs, so overriding the body does not disturb them — the wait is
 * repeated in the message purely so a human reading the response sees it.
 */
const handlerFor = (what) => (req, res) => {
  const seconds = retryAfterSeconds(req);
  const minutes = Math.ceil(seconds / 60);
  const wait = seconds < 90 ? `${seconds} second${seconds === 1 ? "" : "s"}` : `${minutes} minutes`;

  res.status(429).json({
    success: false,
    message: `Too many ${what}. Please try again in about ${wait}.`,
    retryAfterSeconds: seconds,
  });
};

const base = {
  windowMs: env.rateLimit.windowMs,
  standardHeaders: true,
  legacyHeaders: false,
};

/** The submitted email, normalised the same way the validators normalise it. */
const emailKey = (req) => {
  const raw = req.body?.email;
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null;
};

/** Every API request from one address. */
export const generalLimiter = rateLimit({
  ...base,
  max: env.rateLimit.max,
  handler: handlerFor("requests"),
});

/**
 * Failed authentication attempts from one address.
 *
 * `skipSuccessfulRequests` is what makes a generous ceiling safe: a school
 * signing in all morning never touches this, because only failures count.
 */
export const authLimiter = rateLimit({
  ...base,
  max: env.rateLimit.authMax,
  skipSuccessfulRequests: true,
  handler: handlerFor("sign-in attempts from this network"),
});

/**
 * Failed attempts against one email address, from anywhere.
 *
 * Spreading an attack over a botnet defeats a per-IP limit completely; it does
 * not defeat this one. Requests carrying no email are skipped rather than
 * folded into an IP bucket, so this limiter only ever means "this account".
 */
export const accountLimiter = rateLimit({
  ...base,
  max: env.rateLimit.accountMax,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `account:${emailKey(req)}`,
  skip: (req) => emailKey(req) === null,
  handler: handlerFor("attempts for this account"),
});

/**
 * Rejected refreshes from one address.
 *
 * A valid session refreshing normally succeeds and is skipped, so this only
 * counts something replaying or guessing tokens.
 */
export const refreshLimiter = rateLimit({
  ...base,
  max: env.rateLimit.refreshMax,
  skipSuccessfulRequests: true,
  handler: handlerFor("session refresh attempts"),
});

/**
 * Wrong current-password attempts by one signed-in user.
 *
 * Mounted after `authenticate`, so it keys on the account rather than the
 * network — this is about a stolen session guessing the existing password,
 * and that attacker holds one account no matter how many addresses they use.
 */
export const passwordChangeLimiter = rateLimit({
  ...base,
  max: env.rateLimit.passwordChangeMax,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `pwchange:${req.user?.id ?? "anonymous"}`,
  handler: handlerFor("password change attempts"),
});

/**
 * Rejected webhook deliveries from one address.
 *
 * The webhook endpoint is deliberately outside `generalLimiter`, because
 * gateways retry hard and dropping a retry loses a payment confirmation. That
 * leaves it the one unauthenticated, unlimited route in the app, and every
 * forged request costs an HMAC over the whole body before it can be rejected.
 *
 * `skipSuccessfulRequests` is what makes this safe to add: a genuine delivery
 * verifies and answers 2xx, so real gateway traffic — including a retry storm
 * after an outage — never adds to this budget at all. Only requests that fail
 * verification count.
 *
 * Note what that does and does not mean. Skipping stops a request being
 * *counted*, not being *blocked*: once an address is over budget, everything
 * from it is refused. That is fine only because the key is the address — a
 * flood exhausts the flooder's own budget, while the gateway sends from its
 * own addresses and only ever sends deliveries that verify, so its budget
 * stays whole and it is never blocked.
 *
 * Keyed per IP rather than per account: at this point in the request there is
 * no authenticated identity, and there must not be.
 */
export const webhookLimiter = rateLimit({
  ...base,
  max: env.rateLimit.webhookMax,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `webhook:${req.ip}`,
  handler: handlerFor("webhook deliveries"),
});
