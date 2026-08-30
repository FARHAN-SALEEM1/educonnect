import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import rateLimit from "express-rate-limit";
import { env } from "../src/config/env.js";

/**
 * Rate limiting.
 *
 * Every test here builds its own tiny express app with its own limiter, so
 * each starts from an empty counter and none of them touch the database or
 * the seeded data. The limiters are constructed with the same options the
 * real ones use — the shape under test is the policy, not the wiring.
 *
 * The policy being pinned:
 *   • per-IP budgets are generous, because a school shares one address
 *   • per-identity budgets are tight, because that is what stops stuffing
 *   • successes never count toward a failure budget
 *   • a 429 carries Retry-After and the RateLimit-* headers
 */

const WINDOW = 60_000;

const shared = {
  windowMs: WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
};

const handler = (req, res) => {
  const reset = req.rateLimit?.resetTime;
  const seconds = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 60;
  res.status(429).json({ success: false, message: "Too many attempts", retryAfterSeconds: seconds });
};

const emailKey = (req) => {
  const raw = req.body?.email;
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : null;
};

/**
 * An app whose POST /try succeeds or fails according to the body, so a test
 * can drive the "failures only" behaviour without any real authentication.
 */
const appWith = (limiter) => {
  const app = express();
  app.use(express.json());
  app.post("/try", limiter, (req, res) => {
    if (req.body?.succeed) return res.status(200).json({ ok: true });
    return res.status(401).json({ success: false, message: "nope" });
  });
  return app;
};

const failureLimiter = (opts) =>
  rateLimit({ ...shared, skipSuccessfulRequests: true, handler, ...opts });

const post = (app, body) => request(app).post("/try").send(body);

// ── per-IP, failures only ─────────────────────────────────────────────
describe("per-network limit counts failures only", () => {
  it("lets successful sign-ins through without ever counting them", async () => {
    const app = appWith(failureLimiter({ max: 3 }));
    // Far more successes than the budget: a school signing in all morning.
    for (let i = 0; i < 25; i += 1) {
      const res = await post(app, { succeed: true, email: `user${i}@school.edu` });
      expect(res.status, `success ${i} must not be limited`).toBe(200);
    }
    // The budget is untouched, so failures still get their full allowance.
    for (let i = 0; i < 3; i += 1) {
      expect((await post(app, { email: "user@school.edu" })).status).toBe(401);
    }
    expect((await post(app, { email: "user@school.edu" })).status).toBe(429);
  });

  it("blocks once the failure budget is spent", async () => {
    const app = appWith(failureLimiter({ max: 3 }));
    for (let i = 0; i < 3; i += 1) expect((await post(app, {})).status).toBe(401);
    expect((await post(app, {})).status).toBe(429);
  });

  it("keeps a school-sized budget well clear of ordinary mistyping", () => {
    // A whole school sharing one address: the per-IP failure budget must be
    // far larger than a handful of forgotten passwords.
    expect(env.rateLimit.authMax).toBeGreaterThanOrEqual(50);
    // …and the general budget must survive a page view being several calls.
    expect(env.rateLimit.max).toBeGreaterThanOrEqual(2000);
  });
});

// ── per-account ───────────────────────────────────────────────────────
describe("per-account limit", () => {
  const accountLimiter = () =>
    failureLimiter({
      max: 3,
      keyGenerator: (req) => `account:${emailKey(req)}`,
      skip: (req) => emailKey(req) === null,
    });

  it("stops repeated attempts on one account", async () => {
    const app = appWith(accountLimiter());
    for (let i = 0; i < 3; i += 1) {
      expect((await post(app, { email: "victim@school.edu" })).status).toBe(401);
    }
    expect((await post(app, { email: "victim@school.edu" })).status).toBe(429);
  });

  it("does not punish a different account from the same network", async () => {
    const app = appWith(accountLimiter());
    for (let i = 0; i < 4; i += 1) await post(app, { email: "victim@school.edu" });
    // Same IP, different account — a colleague at the same school.
    expect((await post(app, { email: "colleague@school.edu" })).status).toBe(401);
  });

  it("treats the same address as one account whatever the casing or spacing", async () => {
    const app = appWith(accountLimiter());
    const spellings = ["victim@school.edu", "VICTIM@school.edu", "  Victim@School.edu  "];
    for (let i = 0; i < 3; i += 1) await post(app, { email: spellings[i] });
    expect((await post(app, { email: "victim@school.edu" })).status).toBe(429);
  });

  it("still lets that account sign in successfully while under attack", async () => {
    // Successes are skipped, so the real owner is not locked out by someone
    // else's failed guesses until the budget is genuinely spent.
    const app = appWith(accountLimiter());
    for (let i = 0; i < 2; i += 1) await post(app, { email: "victim@school.edu" });
    expect((await post(app, { succeed: true, email: "victim@school.edu" })).status).toBe(200);
  });

  it("ignores requests that carry no email rather than bucketing them together", async () => {
    // reset-password sends a token, not an address; it must not all collapse
    // into one shared key.
    const app = appWith(accountLimiter());
    for (let i = 0; i < 10; i += 1) {
      expect((await post(app, { token: `t${i}` })).status).toBe(401);
    }
  });
});

// ── 429 shape ─────────────────────────────────────────────────────────
describe("a 429 tells the client when to come back", () => {
  it("sends Retry-After and the RateLimit-* headers", async () => {
    const app = appWith(failureLimiter({ max: 1 }));
    await post(app, {});
    const res = await post(app, {});

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(res.headers["ratelimit-limit"]).toBe("1");
    expect(res.headers["ratelimit-remaining"]).toBe("0");
    expect(res.headers["ratelimit-reset"]).toBeDefined();
    expect(res.headers["ratelimit-policy"]).toMatch(/^1;w=60$/);
  });

  it("keeps the JSON envelope every other error uses", async () => {
    const app = appWith(failureLimiter({ max: 1 }));
    await post(app, {});
    const res = await post(app, {});
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts down remaining as the budget is spent", async () => {
    const app = appWith(failureLimiter({ max: 3 }));
    const first = await post(app, {});
    const second = await post(app, {});
    expect(Number(first.headers["ratelimit-remaining"])).toBe(2);
    expect(Number(second.headers["ratelimit-remaining"])).toBe(1);
  });
});

// ── recovery ──────────────────────────────────────────────────────────
describe("the limit recovers", () => {
  it("lets requests through again once the window rolls over", async () => {
    // A 300ms window so the test can actually wait it out.
    const app = appWith(
      rateLimit({ windowMs: 300, max: 2, standardHeaders: true, legacyHeaders: false,
        skipSuccessfulRequests: true, handler })
    );
    for (let i = 0; i < 2; i += 1) expect((await post(app, {})).status).toBe(401);
    expect((await post(app, {})).status).toBe(429);

    await new Promise((r) => setTimeout(r, 400));

    expect((await post(app, {})).status, "budget should have reset").toBe(401);
  });
});

// ── configuration ─────────────────────────────────────────────────────
describe("the configured policy", () => {
  it("keeps per-account far tighter than per-network", () => {
    expect(env.rateLimit.accountMax).toBeLessThan(env.rateLimit.authMax);
    expect(env.rateLimit.accountMax).toBeGreaterThanOrEqual(5); // room for honest mistakes
    expect(env.rateLimit.accountMax).toBeLessThanOrEqual(15); // but not for guessing
  });

  it("covers refresh and password change", () => {
    expect(env.rateLimit.refreshMax).toBeGreaterThan(0);
    expect(env.rateLimit.passwordChangeMax).toBeGreaterThan(0);
    expect(env.rateLimit.passwordChangeMax).toBeLessThanOrEqual(15);
  });

  it("uses a window measured in minutes, not hours", () => {
    expect(env.rateLimit.windowMs).toBeGreaterThanOrEqual(60_000);
    expect(env.rateLimit.windowMs).toBeLessThanOrEqual(60 * 60_000);
  });
});

// ── wiring ────────────────────────────────────────────────────────────
describe("the real limiters are wired to the real routes", () => {
  it("exports one limiter per protected surface", async () => {
    const mod = await import("../src/middleware/rateLimit.js");
    for (const name of [
      "generalLimiter", "authLimiter", "accountLimiter",
      "refreshLimiter", "passwordChangeLimiter", "webhookLimiter",
    ]) {
      expect(typeof mod[name], `${name} must be middleware`).toBe("function");
    }
  });

  /**
   * The webhook route sits outside the general limiter on purpose, so that a
   * gateway's retry storm is never dropped. That makes it the one
   * unauthenticated unlimited surface in the app, and each forged request
   * costs a full-body HMAC before it can be refused.
   */
  it("never counts a genuine delivery, so a retry storm cannot exhaust the budget", async () => {
    const app = appWith(failureLimiter({ max: 3, keyGenerator: (req) => `webhook:${req.ip}` }));

    // A gateway retrying hard after an outage: every one verifies, so none is
    // counted and the budget is still whole afterwards.
    for (let i = 0; i < 50; i += 1) {
      expect((await post(app, { succeed: true })).status, `delivery ${i}`).toBe(200);
    }
    for (let i = 0; i < 3; i += 1) {
      expect((await post(app, {})).status, `forgery ${i} should still be allowed`).toBe(401);
    }
    const blocked = await post(app, {});
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  /**
   * Worth stating precisely, because it is the whole reason this limiter is
   * safe to put on an endpoint that must not lose deliveries:
   * `skipSuccessfulRequests` stops a request being *counted*, not being
   * *blocked*. Once an address is over budget, everything from it is refused,
   * genuine or not.
   *
   * That is acceptable only because the key is the address. A flood from an
   * attacker exhausts the attacker's own budget; the gateway sends from its
   * own addresses and only ever sends deliveries that verify, so its budget is
   * never touched and it is never blocked.
   */
  it("blocks only the flooding address, leaving the gateway's own unaffected", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.post("/try", failureLimiter({ max: 3, keyGenerator: (req) => `webhook:${req.ip}` }),
      (req, res) => (req.body?.succeed ? res.status(200).json({ ok: true })
                                       : res.status(401).json({ ok: false })));

    const from = (ip, body) =>
      request(app).post("/try").set("X-Forwarded-For", ip).send(body);

    for (let i = 0; i < 3; i += 1) {
      expect((await from("203.0.113.9", {})).status).toBe(401);
    }
    expect((await from("203.0.113.9", {})).status).toBe(429); // attacker capped

    // The gateway, on a different address, is entirely unaffected.
    expect((await from("198.51.100.4", { succeed: true })).status).toBe(200);
  });

  it("mounts the webhook limiter on the raw-body route, above the JSON parser", async () => {
    const { readFileSync } = await import("node:fs");
    const appSrc = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

    const route = appSrc.indexOf('"/api/billing/webhook/:provider"');
    // The actual middleware registration, not the comment above the route that
    // also mentions express.json().
    const json = appSrc.search(/app\.use\(\s*express\.json\(/);
    expect(route).toBeGreaterThan(-1);
    expect(json).toBeGreaterThan(-1);
    expect(route, "webhook must be registered before express.json()").toBeLessThan(json);
    expect(appSrc.slice(route, json)).toMatch(/webhookLimiter/);
  });

  it("applies them to login, signup, forgot, reset, refresh and change-password", async () => {
    const { readFileSync } = await import("node:fs");
    const routes = readFileSync(new URL("../src/routes/auth.routes.js", import.meta.url), "utf8");

    expect(routes).toMatch(/post\("\/login",\s*authLimiter,\s*accountLimiter/);
    expect(routes).toMatch(/post\("\/signup",\s*authLimiter,\s*accountLimiter/);
    expect(routes).toMatch(/post\("\/refresh",\s*refreshLimiter/);
    expect(routes).toMatch(/"\/forgot-password",\s*authLimiter,\s*accountLimiter/);
    expect(routes).toMatch(/"\/reset-password",\s*authLimiter/);
    // Must sit after authenticate, or it cannot key on the user.
    expect(routes).toMatch(/"\/change-password",\s*authenticate,\s*passwordChangeLimiter/);
  });
});
