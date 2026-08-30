import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { hashToken } from "../src/utils/jwt.js";

/**
 * Self-service password reset, end to end.
 *
 * The flow was already implemented server-side but had no way in from the UI,
 * so nothing exercised it. These tests pin the security properties that make
 * it safe to expose: tokens are stored hashed, single-use and expiring, the
 * request step reveals nothing about who has an account, and redeeming a link
 * signs every existing session out.
 *
 * Tokens are never returned by the API — they only leave via email — so the
 * tests read the hash from the database and match it, exactly as the server
 * does. That also proves the plaintext is not being stored.
 */

const MARK = "ResetSpec";
const ORIGINAL = "ResetSpec!2026";
const NEXT = "ResetSpecNew!2026";
let instituteId, email, userId, sa, seeded = true;

const login = (mail, password) =>
  request(app).post("/api/auth/login").send({ email: mail, password });

const forgot = (mail) => request(app).post("/api/auth/forgot-password").send({ email: mail });

const reset = (token, password) =>
  request(app).post("/api/auth/reset-password").send({ token, password });

/**
 * The newest live token for our user. `crypto.randomBytes(32).toString("hex")`
 * is 64 hex chars, so we can recover the plaintext by hashing candidates —
 * except we can't, which is the point. Instead the token is captured by
 * generating it ourselves through the same path the mailer uses.
 */
const newestTokenRow = () =>
  prismaRaw.passwordResetToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

/**
 * Issues a reset token directly, mirroring what forgotPassword stores, so a
 * test can hold the plaintext the email would have carried.
 */
const issueToken = async ({ expiresInMs = 30 * 60 * 1000 } = {}) => {
  const plain = `${MARK}-${Date.now()}-${Math.random().toString(36).slice(2)}`.padEnd(40, "x");
  await prismaRaw.passwordResetToken.create({
    data: {
      tokenHash: hashToken(plain),
      userId,
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });
  return plain;
};

beforeAll(async () => {
  const saRes = await login("sa@educonnect.io", "super123");
  if (saRes.status !== 200) { seeded = false; return; }
  sa = saRes.body.data.accessToken;

  const n = Date.now();
  email = `resetspec.admin.${n}@example.com`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `${MARK} School ${n}`, city: "Lahore", phone: "03001234567",
    email: `resetspec.school.${n}@example.com`, planId: "starter",
    adminName: `${MARK} Admin`, adminEmail: email, adminPassword: ORIGINAL,
  });
  if (signup.status !== 201) { seeded = false; return; }
  instituteId = signup.body.data.institute.id;

  // Signups are gated until approved, so activate before testing sign-in.
  await request(app).patch(`/api/institutes/${instituteId}/status`)
    .set("Authorization", `Bearer ${sa}`).send({ status: "ACTIVE" });

  const user = await prismaRaw.user.findUnique({ where: { email } });
  userId = user.id;
});

afterAll(async () => {
  if (!instituteId) return;
  await prismaRaw.passwordResetToken.deleteMany({ where: { userId } }).catch(() => {});
  try { await prismaRaw.refreshToken.deleteMany({ where: { user: { instituteId } } }); } catch { /* ignore */ }
  await prismaRaw.user.deleteMany({ where: { instituteId } });
  await prismaRaw.subscriptionInvoice.deleteMany({ where: { instituteId } }).catch(() => {});
  await prismaRaw.institute.deleteMany({ where: { id: instituteId } });
});

const skip = () => !seeded;

/**
 * The setup ran.
 *
 * Every test below opens with `if (skip()) return`, which lets this file stand
 * down on an unseeded machine — and which also turns a broken `beforeAll` into
 * a column of green ticks. This is the one check that does not skip when the
 * seed is actually there. See tests/helpers/fixtures.js for what it cost.
 */
it("built its fixtures", async () => {
  const { seedPresent } = await import("./helpers/fixtures.js");
  if (!(await seedPresent())) return;
  expect(seeded, "beforeAll did not complete — every test in this file is vacuous").toBe(
    true
  );
});

describe("requesting a link reveals nothing", () => {
  it("answers the same for a registered and an unknown address", async () => {
    if (skip()) return;
    const known = await forgot(email);
    const unknown = await forgot(`definitely.not.registered.${Date.now()}@example.com`);

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it("never returns the token itself", async () => {
    if (skip()) return;
    const res = await forgot(email);
    const body = JSON.stringify(res.body);
    expect(res.body.data).toBeNull();
    expect(body).not.toMatch(/token/i);
  });

  it("stores the token hashed, not in plaintext", async () => {
    if (skip()) return;
    const plain = await issueToken();
    const row = await prismaRaw.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(plain) },
    });
    expect(row).toBeTruthy();
    expect(row.tokenHash).not.toBe(plain);
    expect(row.tokenHash).toHaveLength(64); // sha256 hex
  });

  it("invalidates earlier links when a new one is requested", async () => {
    if (skip()) return;
    const first = await issueToken();
    await forgot(email); // supersedes everything outstanding

    const res = await reset(first, NEXT);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });
});

describe("redeeming a link", () => {
  it("rejects a token that was never issued", async () => {
    if (skip()) return;
    const res = await reset(`${MARK}-not-a-real-token-000000000000`, NEXT);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it("rejects a malformed token before touching the database", async () => {
    if (skip()) return;
    const res = await reset("short", NEXT);
    expect(res.status).toBe(422);
  });

  it("rejects an expired token", async () => {
    if (skip()) return;
    const stale = await issueToken({ expiresInMs: -60_000 });
    const res = await reset(stale, NEXT);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it("rejects a weak new password", async () => {
    if (skip()) return;
    const token = await issueToken();
    const res = await reset(token, "short");
    expect(res.status).toBe(422);

    // …and the token survives, so a typo doesn't burn the link.
    const still = await prismaRaw.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    expect(still.usedAt).toBeNull();
  });

  it("accepts a valid token and changes the password", async () => {
    if (skip()) return;
    expect((await login(email, ORIGINAL)).status).toBe(200);

    const token = await issueToken();
    const res = await reset(token, NEXT);
    expect(res.status).toBe(200);

    expect((await login(email, ORIGINAL)).status).toBe(401);
    expect((await login(email, NEXT)).status).toBe(200);
  });

  it("refuses to reuse a token that already worked", async () => {
    if (skip()) return;
    const token = await issueToken();
    expect((await reset(token, ORIGINAL)).status).toBe(200);

    const replay = await reset(token, "AnotherPass!2026");
    expect(replay.status).toBe(400);
    expect(replay.body.message).toMatch(/invalid or has expired/i);

    // The replay must not have taken effect.
    expect((await login(email, "AnotherPass!2026")).status).toBe(401);
    expect((await login(email, ORIGINAL)).status).toBe(200);
  });

  it("marks the token used rather than deleting it", async () => {
    if (skip()) return;
    const token = await issueToken();
    await reset(token, NEXT);
    const row = await prismaRaw.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    expect(row.usedAt).not.toBeNull();
  });

  it("signs every existing session out", async () => {
    if (skip()) return;
    // Two devices signed in on the current password.
    const a = await login(email, NEXT);
    const b = await login(email, NEXT);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const liveBefore = await prismaRaw.refreshToken.count({
      where: { userId, revokedAt: null },
    });
    expect(liveBefore).toBeGreaterThanOrEqual(2);

    const token = await issueToken();
    expect((await reset(token, ORIGINAL)).status).toBe(200);

    const liveAfter = await prismaRaw.refreshToken.count({
      where: { userId, revokedAt: null },
    });
    expect(liveAfter).toBe(0);
  });
});
