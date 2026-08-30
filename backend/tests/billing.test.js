import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { __setProviderForTests } from "../src/services/payments/index.js";
import { SignatureError } from "../src/services/payments/provider.js";
import { accessBlock, hasLapsedPayment } from "../src/utils/subscription.js";

/**
 * Billing, exercised through a fake gateway.
 *
 * No Stripe account exists yet and Stripe may not even be usable from
 * Pakistan, so the provider under test here is a local one with a real HMAC
 * signature. That is deliberate rather than a compromise: everything that
 * makes webhooks *safe* — signature verification over raw bytes, idempotency,
 * event ordering, forward-only periods, trial conversion — is our logic, not
 * the gateway's, and this tests all of it end to end through the real route.
 *
 * A dedicated institute is created for these tests and removed afterwards.
 * The seeded schools are read but never modified.
 */

const SECRET = "test-webhook-secret";
const MARK = "BillingSpec";
let instituteId, adminToken, sa, seeded = true;

// ── the fake gateway ──────────────────────────────────────────────────
const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("hex");

const fakeProvider = {
  name: "STRIPE", // reuses an existing enum value; the logic is provider-neutral
  lastCheckout: null,

  async createCheckout({ institute, plan }) {
    fakeProvider.lastCheckout = { instituteId: institute.id, planId: plan.id };
    return { url: "https://pay.example.test/session/abc", customerId: `cus_${institute.id}` };
  },

  verifySignature({ rawBody, headers }) {
    const expected = sign(rawBody);
    if (headers["x-test-signature"] !== expected) throw new SignatureError("bad signature");
    return JSON.parse(rawBody.toString("utf8"));
  },

  /** Set by the retry test to make the next mapping throw, once. */
  failNextMapping: false,

  toBillingUpdate(event) {
    if (fakeProvider.failNextMapping) {
      fakeProvider.failNextMapping = false;
      throw new Error("transient failure while mapping the event");
    }
    if (event.type === "ignore.me") return null;
    return {
      customerRef: event.customerRef,
      // Stands in for a signature-covered reference, the way Safepay's
      // `reference` field works. Only a provider adapter may populate this,
      // and only from inside the signed payload.
      instituteRef: event.instituteRef ?? null,
      subscriptionId: event.subscriptionId ?? null,
      paymentStatus: event.paymentStatus,
      currentPeriodEnd: event.currentPeriodEnd ? new Date(event.currentPeriodEnd) : null,
      priceRef: event.priceRef ?? null,
      occurredAt: new Date(event.occurredAt),
      invoice: event.invoice ?? null,
    };
  },

  async cancelSubscription() {
    return { cancelled: true };
  },
};

/**
 * POSTs a signed event at the real webhook route.
 *
 * The payload is sent as a string, not a Buffer: superagent re-serialises a
 * Buffer into `{"type":"Buffer","data":[…]}`, so the bytes the route received
 * were not the bytes that were signed and every signature failed. Signing the
 * same string keeps the digest identical to what `express.raw` hands over.
 */
const sendEvent = (payload) => {
  const body = JSON.stringify(payload);
  return request(app)
    .post("/api/billing/webhook/stripe")
    .set("Content-Type", "application/json")
    .set("x-test-signature", sign(body))
    .send(body);
};

const evt = (over = {}) => ({
  eventId: `evt_${crypto.randomUUID()}`,
  type: "subscription.updated",
  customerRef: `cus_${instituteId}`,
  paymentStatus: "ACTIVE",
  occurredAt: new Date().toISOString(),
  ...over,
});

const institute = () => prismaRaw.institute.findUnique({ where: { id: instituteId } });

beforeAll(async () => {
  const saRes = await request(app).post("/api/auth/login")
    .send({ email: "sa@educonnect.io", password: "super123" });
  if (saRes.status !== 200) { seeded = false; return; }
  sa = saRes.body.data.accessToken;

  const n = Date.now();
  const signup = await request(app).post("/api/auth/signup").send({
    name: `${MARK} School ${n}`, city: "Lahore", phone: "03001234567",
    email: `billing.school.${n}@example.com`, planId: "growth",
    adminName: `${MARK} Admin`, adminEmail: `billing.admin.${n}@example.com`,
    adminPassword: "BillingSpec!2026",
  });
  if (signup.status !== 201) { seeded = false; return; }
  instituteId = signup.body.data.institute.id;

  await request(app).patch(`/api/institutes/${instituteId}/status`)
    .set("Authorization", `Bearer ${sa}`).send({ status: "ACTIVE" });

  adminToken = (await request(app).post("/api/auth/login")
    .send({ email: `billing.admin.${n}@example.com`, password: "BillingSpec!2026" }))
    .body.data.accessToken;

  __setProviderForTests(fakeProvider);
});

afterEach(async () => {
  if (!instituteId) return;
  await prismaRaw.processedWebhookEvent.deleteMany({ where: { provider: "STRIPE" } });
  await prismaRaw.institute.update({
    where: { id: instituteId },
    data: {
      paymentProvider: "STRIPE",
      providerCustomerId: `cus_${instituteId}`,
      providerSubscriptionId: null,
      paymentStatus: "UNPAID",
      currentPeriodEnd: null,
      lastBillingEventAt: null,
    },
  });
});

afterAll(async () => {
  __setProviderForTests(null);
  if (!instituteId) return;
  await prismaRaw.processedWebhookEvent.deleteMany({ where: { provider: "STRIPE" } });
  await prismaRaw.subscriptionInvoice.deleteMany({ where: { instituteId } });
  try { await prismaRaw.refreshToken.deleteMany({ where: { user: { instituteId } } }); } catch { /* ignore */ }
  await prismaRaw.passwordResetToken.deleteMany({ where: { user: { instituteId } } }).catch(() => {});
  await prismaRaw.user.deleteMany({ where: { instituteId } });
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

// ── signature ─────────────────────────────────────────────────────────
describe("webhook signature", () => {
  it("rejects an unsigned event and changes nothing", async () => {
    if (skip()) return;
    const res = await request(app)
      .post("/api/billing/webhook/stripe")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(evt({ paymentStatus: "ACTIVE" })));

    expect(res.status).toBe(400);
    expect((await institute()).paymentStatus).toBe("UNPAID");
    // Scoped to the gateway under test. Counting the whole table made this
    // fail whenever anything else had recorded an event — which it did, from
    // a manual probe in another process, and the afterEach below then wiped
    // the evidence before it could be looked at.
    expect(await prismaRaw.processedWebhookEvent.count({ where: { provider: "STRIPE" } })).toBe(0);
  });

  it("rejects a forged signature", async () => {
    if (skip()) return;
    const body = JSON.stringify(evt());
    const res = await request(app)
      .post("/api/billing/webhook/stripe")
      .set("Content-Type", "application/json")
      .set("x-test-signature", "deadbeef")
      .send(body);

    expect(res.status).toBe(400);
    expect((await institute()).paymentStatus).toBe("UNPAID");
  });

  it("rejects a tampered body whose signature was valid for the original", async () => {
    if (skip()) return;
    const original = JSON.stringify(evt({ paymentStatus: "UNPAID" }));
    const tampered = JSON.stringify(evt({ paymentStatus: "ACTIVE" }));

    const res = await request(app)
      .post("/api/billing/webhook/stripe")
      .set("Content-Type", "application/json")
      .set("x-test-signature", sign(original))
      .send(tampered);

    expect(res.status).toBe(400);
    expect((await institute()).paymentStatus).toBe("UNPAID");
  });

  it("accepts a correctly signed event", async () => {
    if (skip()) return;
    const res = await sendEvent(evt({ paymentStatus: "ACTIVE" }));
    expect(res.status).toBe(200);
    expect((await institute()).paymentStatus).toBe("ACTIVE");
  });
});

// ── idempotency & ordering ────────────────────────────────────────────
describe("duplicate and out-of-order delivery", () => {
  it("applies a repeated event only once", async () => {
    if (skip()) return;
    const e = evt({ paymentStatus: "ACTIVE", currentPeriodEnd: "2026-12-01T00:00:00.000Z" });

    const first = await sendEvent(e);
    const second = await sendEvent(e);
    const third = await sendEvent(e);

    expect(first.body.data.applied).toBe(true);
    expect(second.body.data.duplicate).toBe(true);
    expect(third.body.data.duplicate).toBe(true);
    expect(second.status).toBe(200); // a 2xx, so the gateway stops retrying
    expect(
      await prismaRaw.processedWebhookEvent.count({ where: { provider: "STRIPE" } })
    ).toBe(1);
  });

  it("ignores an event emitted before the current state", async () => {
    if (skip()) return;
    await sendEvent(evt({
      paymentStatus: "ACTIVE",
      occurredAt: "2026-06-01T00:00:00.000Z",
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    }));

    // A failure that was emitted EARLIER but arrived later.
    const late = await sendEvent(evt({
      paymentStatus: "PAST_DUE",
      occurredAt: "2026-05-01T00:00:00.000Z",
    }));

    expect(late.body.data.applied).toBe(false);
    expect((await institute()).paymentStatus).toBe("ACTIVE");
  });

  it("never moves currentPeriodEnd backwards", async () => {
    if (skip()) return;
    await sendEvent(evt({
      paymentStatus: "ACTIVE",
      occurredAt: "2026-06-01T00:00:00.000Z",
      currentPeriodEnd: "2026-12-31T00:00:00.000Z",
    }));

    // A newer event carrying an EARLIER period must not shorten access.
    await sendEvent(evt({
      paymentStatus: "ACTIVE",
      occurredAt: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    }));

    expect((await institute()).currentPeriodEnd.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("acknowledges events it does not act on, so they are not retried", async () => {
    if (skip()) return;
    const res = await sendEvent(evt({ type: "ignore.me" }));
    expect(res.status).toBe(200);
    expect(res.body.data.ignored).toBe(true);
  });

  it("survives the same event arriving twice at once", async () => {
    if (skip()) return;
    // Gateways fan out deliveries in parallel and retry while the first
    // attempt is still running, so the duplicate check has to hold under
    // genuine concurrency, not just sequentially.
    const e = evt({ paymentStatus: "ACTIVE", currentPeriodEnd: "2026-12-01T00:00:00.000Z" });
    const results = await Promise.all([sendEvent(e), sendEvent(e), sendEvent(e), sendEvent(e)]);

    const applied = results.filter((r) => r.body?.data?.applied === true);
    const duplicates = results.filter((r) => r.body?.data?.duplicate === true);

    expect(applied).toHaveLength(1);
    expect(duplicates).toHaveLength(3);
    expect(
      await prismaRaw.processedWebhookEvent.count({ where: { provider: "STRIPE" } })
    ).toBe(1);
    for (const r of results) expect(r.status).toBe(200);
  });

  it("never lets a concurrent older event overwrite a newer one", async () => {
    if (skip()) return;
    // Distinct events (so idempotency does not mask the race), delivered
    // together, one clearly older than the other.
    const newer = evt({
      paymentStatus: "ACTIVE",
      occurredAt: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-12-31T00:00:00.000Z",
    });
    const older = evt({
      paymentStatus: "CANCELED",
      occurredAt: "2026-05-01T00:00:00.000Z",
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
    });

    await Promise.all([sendEvent(newer), sendEvent(older)]);

    const after = await institute();
    // Whichever landed first, the newer event's state must be what survives.
    expect(after.paymentStatus).toBe("ACTIVE");
    expect(after.currentPeriodEnd.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

// ── lifecycle ─────────────────────────────────────────────────────────
describe("subscription lifecycle", () => {
  it("converts a trial to paid only on a verified event", async () => {
    if (skip()) return;
    const future = new Date(Date.now() + 7 * 864e5);
    await prismaRaw.institute.update({ where: { id: instituteId }, data: { trialEndsAt: future } });

    // The return URL grants nothing; only the webhook does.
    expect((await institute()).trialEndsAt).not.toBeNull();

    await sendEvent(evt({
      paymentStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
    }));

    const after = await institute();
    expect(after.trialEndsAt).toBeNull();
    expect(after.paymentStatus).toBe("ACTIVE");
  });

  it("leaves the trial alone when payment has not succeeded", async () => {
    if (skip()) return;
    const future = new Date(Date.now() + 7 * 864e5);
    await prismaRaw.institute.update({ where: { id: instituteId }, data: { trialEndsAt: future } });

    await sendEvent(evt({ paymentStatus: "PAST_DUE" }));

    expect((await institute()).trialEndsAt).not.toBeNull();
    await prismaRaw.institute.update({ where: { id: instituteId }, data: { trialEndsAt: null } });
  });

  it("records a failed payment as PAST_DUE", async () => {
    if (skip()) return;
    await sendEvent(evt({ paymentStatus: "PAST_DUE" }));
    expect((await institute()).paymentStatus).toBe("PAST_DUE");
  });

  it("records a cancellation as CANCELED", async () => {
    if (skip()) return;
    await sendEvent(evt({ paymentStatus: "CANCELED" }));
    expect((await institute()).paymentStatus).toBe("CANCELED");
  });

  it("writes a paid invoice into the existing ledger", async () => {
    if (skip()) return;
    await sendEvent(evt({
      paymentStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
      invoice: { period: "2026-09", amount: 12999, paid: true },
    }));

    const inv = await prismaRaw.subscriptionInvoice.findFirst({
      where: { instituteId, period: "2026-09" },
    });
    expect(inv?.status).toBe("PAID");
    expect(inv?.amount).toBe(12999);
  });

  it("stores the subscription id when first seen", async () => {
    if (skip()) return;
    await sendEvent(evt({ paymentStatus: "ACTIVE", subscriptionId: "sub_123" }));
    expect((await institute()).providerSubscriptionId).toBe("sub_123");
  });

  it("moves the institute onto the plan it actually paid for", async () => {
    if (skip()) return;
    // The plan follows the price the gateway charged, never what the browser
    // asked for — a request to upgrade means nothing until money moves.
    await prismaRaw.plan.update({
      where: { id: "elite" },
      data: { providerPriceIds: { STRIPE: "price_elite_test" } },
    });
    expect((await institute()).planId).toBe("growth");

    await sendEvent(evt({ paymentStatus: "ACTIVE", priceRef: "price_elite_test" }));

    expect((await institute()).planId).toBe("elite");

    await prismaRaw.plan.update({ where: { id: "elite" }, data: { providerPriceIds: null } });
    await prismaRaw.institute.update({ where: { id: instituteId }, data: { planId: "growth" } });
  });

  it("leaves the plan alone when the price is unrecognised", async () => {
    if (skip()) return;
    await sendEvent(evt({ paymentStatus: "ACTIVE", priceRef: "price_not_ours" }));
    expect((await institute()).planId).toBe("growth");
  });
});

// ── access control ────────────────────────────────────────────────────
describe("access follows payment state", () => {
  it("blocks a gateway institute whose paid period has passed", () => {
    const lapsed = {
      status: "ACTIVE", paymentProvider: "STRIPE", paymentStatus: "PAST_DUE",
      currentPeriodEnd: new Date(Date.now() - 864e5),
    };
    expect(hasLapsedPayment(lapsed)).toBe(true);
    expect(accessBlock(lapsed)?.status).toBe("PAYMENT_REQUIRED");
  });

  it("keeps access until the paid period actually ends", () => {
    const grace = {
      status: "ACTIVE", paymentProvider: "STRIPE", paymentStatus: "PAST_DUE",
      currentPeriodEnd: new Date(Date.now() + 864e5),
    };
    expect(hasLapsedPayment(grace)).toBe(false);
    expect(accessBlock(grace)).toBeNull();
  });

  it("never gates a NONE or MANUAL institute on payment state", () => {
    for (const provider of ["NONE", "MANUAL", undefined]) {
      const inst = {
        status: "ACTIVE", paymentProvider: provider, paymentStatus: "UNPAID",
        currentPeriodEnd: new Date(Date.now() - 864e5),
      };
      expect(hasLapsedPayment(inst), `${provider} must not be gated`).toBe(false);
      expect(accessBlock(inst)).toBeNull();
    }
  });

  it("leaves the seeded schools untouched", async () => {
    if (skip()) return;
    const seededSchools = await prismaRaw.institute.findMany({
      where: { code: { in: ["INS001", "INS002", "INS003"] } },
    });
    expect(seededSchools).toHaveLength(3);
    for (const s of seededSchools) {
      expect(s.paymentProvider).toBe("NONE");
      expect(accessBlock(s), `${s.code} must still be allowed`).toBeNull();
    }
  });
});

// ── admin surface ─────────────────────────────────────────────────────
describe("admin billing endpoints", () => {
  it("starts a checkout and returns a gateway URL", async () => {
    if (skip()) return;
    const res = await request(app)
      .post("/api/billing/checkout-session")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ planId: "growth" });

    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^https:\/\//);
    // The URL is all the client gets — no secret, no confirmation of payment.
    expect(JSON.stringify(res.body)).not.toMatch(/secret|sk_|whsec/i);
  });

  it("reports status without leaking provider identifiers", async () => {
    if (skip()) return;
    const res = await request(app)
      .get("/api/billing/status")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/cus_|sub_|secret/i);
    expect(res.body.data).toHaveProperty("paymentStatus");
  });

  it("refuses an unauthenticated caller", async () => {
    if (skip()) return;
    expect((await request(app).get("/api/billing/status")).status).toBe(401);
    expect((await request(app).post("/api/billing/checkout-session").send({})).status).toBe(401);
  });

  it("refuses a teacher or parent", async () => {
    if (skip()) return;
    const teacher = (await request(app).post("/api/auth/login")
      .send({ email: "hassan@bhs.edu", password: "teach123" })).body.data.accessToken;
    const res = await request(app)
      .get("/api/billing/status").set("Authorization", `Bearer ${teacher}`);
    expect(res.status).toBe(403);
  });

  it("cannot be used to touch another institute's billing", async () => {
    if (skip()) return;
    // An event naming a customer that belongs to nobody must not apply.
    const res = await sendEvent(evt({ customerRef: "cus_someone_else", paymentStatus: "ACTIVE" }));
    expect(res.body.data.applied).toBe(false);

    const seededBhs = await prismaRaw.institute.findFirst({ where: { code: "INS001" } });
    expect(seededBhs.paymentStatus).toBe("UNPAID");
    expect(seededBhs.paymentProvider).toBe("NONE");
  });
});

// ── manual provider ───────────────────────────────────────────────────
describe("the manual provider keeps bank transfer working", () => {
  it("refuses online checkout with an explanation", async () => {
    if (skip()) return;
    const { manualProvider } = await import("../src/services/payments/manual.js");
    __setProviderForTests(manualProvider);

    const res = await request(app)
      .post("/api/billing/checkout-session")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ planId: "growth" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bank transfer/i);

    __setProviderForTests(fakeProvider);
  });

  it("leaves the super-admin manual invoice flow working", async () => {
    if (skip()) return;
    const list = await request(app)
      .get("/api/subscription-invoices?limit=5").set("Authorization", `Bearer ${sa}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
  });
});

// ── invariants that must hold before a real gateway is connected ───────
describe("provider price identifiers stay on the server", () => {
  /**
   * `providerPriceIds` is the gateway's own price map. It is not a credential,
   * but it has no business in a browser payload, and a bare `plan: true` would
   * publish it — plus anything sensitive added to the model later — from every
   * endpoint that embeds a plan at once.
   */
  const hasPriceIds = (value) => JSON.stringify(value ?? null).includes("providerPriceIds");

  it("is absent from the login and refresh payloads", async () => {
    if (skip()) return;
    const login = await request(app).post("/api/auth/login")
      .send({ email: "admin@bhs.edu", password: "admin123" });
    if (login.status !== 200) return;
    expect(hasPriceIds(login.body)).toBe(false);
    expect(login.body.data.user.institute.plan.name).toBeTruthy(); // the plan is still there
  });

  it("is absent from billing status, the dashboard and the institute record", async () => {
    if (skip()) return;
    const urls = [
      "/api/billing/status",
      "/api/dashboard/admin",
      "/api/institutes/me/subscription",
      `/api/institutes/${instituteId}`,
    ];
    let checked = 0;
    for (const url of urls) {
      const res = await request(app).get(url).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status, `${url} was unreachable`).toBe(200);
      expect(hasPriceIds(res.body), `${url} leaked providerPriceIds`).toBe(false);
      checked += 1;
    }
    expect(checked).toBe(urls.length); // a skipped endpoint proves nothing
  });

  it("is absent from the super admin's institute list", async () => {
    if (skip()) return;
    const res = await request(app).get("/api/institutes?limit=5").set("Authorization", `Bearer ${sa}`);
    expect(res.status).toBe(200);
    expect(hasPriceIds(res.body)).toBe(false);
  });

  it("is still readable server-side, so price → plan resolution keeps working", async () => {
    const { PLAN_PUBLIC } = await import("../src/utils/publicFields.js");
    expect(PLAN_PUBLIC.providerPriceIds).toBeUndefined();
    const plan = await prismaRaw.plan.findUnique({ where: { id: "growth" } });
    expect(plan).toHaveProperty("providerPriceIds");
  });
});

describe("binding a school to the gateway on its first event", () => {
  /**
   * Safepay issues no customer identifier at checkout, so the first webhook can
   * only be tied to a school by the reference we supplied when the checkout was
   * created. That reference is inside the signed payload, which is what makes
   * it safe to resolve an institute from.
   */
  it("matches on the signed reference when the customer is unknown, then binds it", async () => {
    if (skip()) return;
    await prismaRaw.institute.update({
      where: { id: instituteId },
      data: { providerCustomerId: null, paymentProvider: "NONE" },
    });

    const res = await sendEvent(evt({
      customerRef: "cus_brand_new",
      instituteRef: instituteId,
      paymentStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
    }));

    expect(res.body.data.applied).toBe(true);

    const after = await institute();
    expect(after.paymentStatus).toBe("ACTIVE");
    // Bound, so every later event matches on the customer id directly.
    expect(after.providerCustomerId).toBe("cus_brand_new");
    expect(after.paymentProvider).toBe("STRIPE");
  });

  it("refuses a reference that names no institute", async () => {
    if (skip()) return;
    const res = await sendEvent(evt({
      customerRef: "cus_unknown",
      instituteRef: "no-such-institute-id",
      paymentStatus: "ACTIVE",
    }));
    expect(res.body.data.applied).toBe(false);
  });

  /**
   * A school already paying through one gateway must not be moved by an event
   * from another, even a correctly signed one.
   */
  it("refuses to redirect a school that is bound to a different gateway", async () => {
    if (skip()) return;
    await prismaRaw.institute.update({
      where: { id: instituteId },
      data: { paymentProvider: "SAFEPAY", providerCustomerId: "safepay_customer" },
    });

    // The fake provider reports itself as STRIPE.
    const res = await sendEvent(evt({
      customerRef: "cus_from_stripe",
      instituteRef: instituteId,
      paymentStatus: "ACTIVE",
    }));

    expect(res.body.data.applied).toBe(false);

    const after = await institute();
    expect(after.paymentProvider).toBe("SAFEPAY");
    expect(after.providerCustomerId).toBe("safepay_customer");
  });

  it("still prefers the customer id when one already matches", async () => {
    if (skip()) return;
    const other = await prismaRaw.institute.findFirst({ where: { id: { not: instituteId } } });
    if (!other) return;

    const res = await sendEvent(evt({
      customerRef: `cus_${instituteId}`, // matches our test institute
      instituteRef: other.id,            // points somewhere else entirely
      paymentStatus: "ACTIVE",
    }));

    expect(res.body.data.applied).toBe(true);
    expect((await institute()).paymentStatus).toBe("ACTIVE");

    const untouched = await prismaRaw.institute.findUnique({ where: { id: other.id } });
    expect(untouched.paymentStatus).toBe(other.paymentStatus);
  });
});

describe("gateway customer and subscription references stay on the server", () => {
  /**
   * The institute's own admin can see whether they are paid up and until when.
   * They have never needed our reference at the gateway, so it does not leave
   * the server from any endpoint — not just from the one that was careful.
   */
  const leaks = (body) => {
    const json = JSON.stringify(body ?? null);
    return ["providerCustomerId", "providerSubscriptionId"].filter((f) => json.includes(f));
  };

  it("is absent from every institute-shaped admin response", async () => {
    if (skip()) return;
    const urls = [
      "/api/billing/status",
      "/api/dashboard/admin",
      "/api/institutes/me/subscription",
      `/api/institutes/${instituteId}`,
    ];
    for (const url of urls) {
      const res = await request(app).get(url).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status, `${url} was unreachable`).toBe(200);
      expect(leaks(res.body), `${url} leaked`).toEqual([]);
    }
  });

  it("is absent from the super admin's list and detail views", async () => {
    if (skip()) return;
    for (const url of ["/api/institutes?limit=5", `/api/institutes/${instituteId}`]) {
      const res = await request(app).get(url).set("Authorization", `Bearer ${sa}`);
      expect(res.status, `${url} was unreachable`).toBe(200);
      expect(leaks(res.body), `${url} leaked`).toEqual([]);
    }
  });

  it("is absent from the login payload", async () => {
    if (skip()) return;
    const login = await request(app).post("/api/auth/login")
      .send({ email: "admin@bhs.edu", password: "admin123" });
    if (login.status !== 200) return;
    expect(leaks(login.body)).toEqual([]);
  });

  /**
   * Stripping them from responses must not stop the webhook matching an event
   * to an institute — that lookup reads the column directly, server-side.
   */
  it("is still stored and still matches an incoming event", async () => {
    if (skip()) return;
    const row = await prismaRaw.institute.findUnique({
      where: { id: instituteId },
      select: { providerCustomerId: true },
    });
    expect(row.providerCustomerId).toBe(`cus_${instituteId}`);

    const res = await sendEvent(evt({ paymentStatus: "ACTIVE" }));
    expect(res.body.data.applied).toBe(true);
  });
});

describe("a webhook cannot reach an institute it was not issued for", () => {
  it("ignores an event whose customer reference matches nobody", async () => {
    if (skip()) return;
    const before = await institute();

    const res = await sendEvent(evt({
      customerRef: "cus_does_not_exist_anywhere",
      paymentStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
    }));

    expect(res.status).toBe(200); // acknowledged, so the gateway stops retrying
    expect(res.body.data.applied).toBe(false);

    const after = await institute();
    expect(after.paymentStatus).toBe(before.paymentStatus);
    expect(after.currentPeriodEnd).toEqual(before.currentPeriodEnd);
  });

  /**
   * The institute is chosen by the customer reference the gateway signed, never
   * by anything the caller can name directly. This asserts the absence of an
   * instituteId escape hatch in the event body.
   */
  it("does not let an event name its own target institute", async () => {
    if (skip()) return;
    const other = await prismaRaw.institute.findFirst({
      where: { id: { not: instituteId } },
      select: { id: true, paymentStatus: true, currentPeriodEnd: true },
    });
    if (!other) return;

    await sendEvent(evt({
      customerRef: "cus_does_not_exist_anywhere",
      instituteId: other.id, // an attacker's idea of a shortcut
      paymentStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 365 * 864e5).toISOString(),
    }));

    const after = await prismaRaw.institute.findUnique({
      where: { id: other.id },
      select: { paymentStatus: true, currentPeriodEnd: true },
    });
    expect(after.paymentStatus).toBe(other.paymentStatus);
    expect(after.currentPeriodEnd).toEqual(other.currentPeriodEnd);
  });
});

describe("returning from the gateway grants nothing", () => {
  /**
   * The whole point of the pending screen. A browser that comes back from
   * checkout — or simply guesses the URL — must not gain paid access; only a
   * signed webhook can do that. There is deliberately no endpoint behind these
   * paths, and this test exists to keep it that way.
   */
  it("has no server route that confirms a payment from the return URL", async () => {
    if (skip()) return;
    const before = await institute();

    for (const path of ["/api/billing/success", "/api/billing/pending", "/api/billing/confirm"]) {
      const res = await request(app).post(path).set("Authorization", `Bearer ${adminToken}`).send({});
      expect([404, 405]).toContain(res.status);
    }

    const after = await institute();
    expect(after.paymentStatus).toBe(before.paymentStatus);
    expect(after.currentPeriodEnd).toEqual(before.currentPeriodEnd);
  });

  it("leaves an institute unpaid after a checkout it never completed", async () => {
    if (skip()) return;
    const res = await request(app).post("/api/billing/checkout-session")
      .set("Authorization", `Bearer ${adminToken}`).send({ planId: "growth" });
    expect(res.status).toBe(200);

    const after = await institute();
    expect(after.paymentStatus).toBe("UNPAID");
    expect(after.currentPeriodEnd).toBeNull();
  });
});

describe("checkout resolves the plan and its price server-side", () => {
  it("refuses a plan that does not exist", async () => {
    if (skip()) return;
    const res = await request(app).post("/api/billing/checkout-session")
      .set("Authorization", `Bearer ${adminToken}`).send({ planId: "not-a-plan" });
    expect(res.status).toBe(400);
  });

  it("refuses a plan that is no longer offered", async () => {
    if (skip()) return;
    const plan = await prismaRaw.plan.findFirst({ where: { isActive: false } });
    if (!plan) return;
    const res = await request(app).post("/api/billing/checkout-session")
      .set("Authorization", `Bearer ${adminToken}`).send({ planId: plan.id });
    expect(res.status).toBe(400);
  });

  /**
   * The request carries a plan id and nothing else that touches money. A price
   * or amount in the body must never be honoured — the gateway is told what to
   * charge from our own Plan record.
   */
  it("ignores a price or amount supplied by the caller", async () => {
    if (skip()) return;
    fakeProvider.lastCheckout = null;

    const res = await request(app).post("/api/billing/checkout-session")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ planId: "growth", price: 1, amount: 1, priceId: "price_attacker" });

    expect(res.status).toBe(200);
    expect(fakeProvider.lastCheckout.planId).toBe("growth");

    const plan = await prismaRaw.plan.findUnique({ where: { id: "growth" } });
    expect(plan.price).toBeGreaterThan(1); // the real price was never overwritten
  });
});

/**
 * A delivery that fails half way must be retryable.
 *
 * The route claims the event id before it does any work, which is what makes
 * two simultaneous deliveries safe. It used to be permanent: when mapping or
 * applying then threw — a database blip, a deadlock, an unexpected payload —
 * the claim stayed behind. The gateway retried, was told "already processed",
 * and the payment was never applied to anything.
 *
 * Reproduced before it was fixed: first delivery 500, retry 200 "duplicate",
 * institute left at UNPAID with no period end and no further delivery coming.
 * A school that had paid would have lost access when its trial ran out.
 */
describe("a delivery that fails part way through", () => {
  it("releases the event so the gateway's retry can apply it", async () => {
    if (skip()) return;

    const event = evt({
      eventId: `evt_retry_${crypto.randomUUID()}`,
      paymentStatus: "ACTIVE",
      currentPeriodEnd: "2027-03-01T00:00:00.000Z",
      occurredAt: "2027-02-01T00:00:00.000Z",
    });

    fakeProvider.failNextMapping = true;
    const first = await sendEvent(event);
    expect(first.status).toBe(500);

    // Nothing was applied, and the claim was given back.
    const midway = await prismaRaw.institute.findUnique({ where: { id: instituteId } });
    expect(midway.currentPeriodEnd?.toISOString()).not.toBe("2027-03-01T00:00:00.000Z");
    expect(
      await prismaRaw.processedWebhookEvent.count({
        where: { provider: "STRIPE", eventId: event.eventId },
      })
    ).toBe(0);

    // The retry does the work.
    const retry = await sendEvent(event);
    expect(retry.status).toBe(200);
    expect(retry.body.data.applied).toBe(true);

    const after = await prismaRaw.institute.findUnique({ where: { id: instituteId } });
    expect(after.paymentStatus).toBe("ACTIVE");
    expect(after.currentPeriodEnd?.toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });

  /**
   * An event we deliberately ignore is a decision, not a failure. Releasing
   * it would have every retry re-examine something already settled.
   */
  it("keeps the claim on an event it deliberately ignored", async () => {
    if (skip()) return;

    const event = evt({ eventId: `evt_ign_${crypto.randomUUID()}`, type: "ignore.me" });
    const first = await sendEvent(event);
    expect(first.status).toBe(200);
    expect(first.body.data.ignored).toBe(true);

    expect(
      await prismaRaw.processedWebhookEvent.count({
        where: { provider: "STRIPE", eventId: event.eventId },
      })
    ).toBe(1);

    const again = await sendEvent(event);
    expect(again.body.data.duplicate).toBe(true);
  });

  /**
   * The release must not reach an event another delivery is holding — it is
   * keyed on the same unique pair the claim was written with.
   */
  it("releases only its own event", async () => {
    if (skip()) return;

    const keeper = evt({ eventId: `evt_keep_${crypto.randomUUID()}`, paymentStatus: "ACTIVE" });
    await sendEvent(keeper);

    const failing = evt({ eventId: `evt_fail_${crypto.randomUUID()}`, paymentStatus: "ACTIVE" });
    fakeProvider.failNextMapping = true;
    await sendEvent(failing);

    // The unrelated claim is untouched, so a replay of it is still a duplicate.
    const replay = await sendEvent(keeper);
    expect(replay.body.data.duplicate).toBe(true);
  });
});

/**
 * Finding the school from the subscription alone.
 *
 * Safepay's 2.0.0 subscription events carry no customer identifier and, in
 * every dashboard test event seen so far, no reference either — only
 * `data.id`, the subscription. So once a school has been bound to one, that
 * id has to be enough to find it again, or the second event of a paid
 * subscription would reach nobody.
 */
describe("matching a school by its subscription", () => {
  /** Clears whatever a previous test left bound, so each starts from the same place. */
  const unbind = () =>
    prismaRaw.institute.update({
      where: { id: instituteId },
      data: { providerSubscriptionId: null },
    });

  it("binds the subscription id on the first event that names the school", async () => {
    if (skip()) return;
    await unbind();

    const res = await sendEvent(evt({
      eventId: `evt_bind_${crypto.randomUUID()}`,
      subscriptionId: `sub_bind_${instituteId}`,
      paymentStatus: "ACTIVE",
    }));
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(true);

    const after = await prismaRaw.institute.findUnique({ where: { id: instituteId } });
    expect(after.providerSubscriptionId).toBe(`sub_bind_${instituteId}`);
    // The provider has to move with it, or the lookup below filters it out.
    expect(after.paymentProvider).toBe("STRIPE");
  });

  /**
   * The case that matters: a later event carrying neither a customer id nor a
   * reference, which is exactly the shape of a real Safepay renewal.
   */
  it("finds the school again from the subscription id alone", async () => {
    if (skip()) return;

    // Self-contained: afterEach clears the binding between tests, so this
    // establishes its own rather than leaning on the one above.
    await sendEvent(evt({
      eventId: `evt_prebind_${crypto.randomUUID()}`,
      subscriptionId: `sub_bind_${instituteId}`,
      paymentStatus: "ACTIVE",
    }));

    const res = await sendEvent({
      eventId: `evt_only_sub_${crypto.randomUUID()}`,
      type: "subscription.payment.succeeded",
      customerRef: null,
      instituteRef: null,
      subscriptionId: `sub_bind_${instituteId}`,
      paymentStatus: "ACTIVE",
      currentPeriodEnd: "2028-01-01T00:00:00.000Z",
      occurredAt: "2027-12-01T00:00:00.000Z",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(true);

    const after = await prismaRaw.institute.findUnique({ where: { id: instituteId } });
    expect(after.currentPeriodEnd?.toISOString()).toBe("2028-01-01T00:00:00.000Z");
  });

  /**
   * An unbound subscription with nothing else to go on must reach no school.
   * Guessing one from a plan or an email address could mark the wrong
   * institute paid, which is the worst thing this path can do.
   */
  it("reaches nobody when the subscription is unknown and nothing else identifies a school", async () => {
    if (skip()) return;

    const before = await prismaRaw.institute.findUnique({ where: { id: instituteId } });

    const res = await sendEvent({
      eventId: `evt_unknown_${crypto.randomUUID()}`,
      type: "subscription.payment.succeeded",
      customerRef: null,
      instituteRef: null,
      subscriptionId: `sub_nobody_${crypto.randomUUID()}`,
      paymentStatus: "ACTIVE",
      currentPeriodEnd: "2029-01-01T00:00:00.000Z",
      occurredAt: "2028-12-01T00:00:00.000Z",
    });

    // Acknowledged so the gateway stops retrying, but applied to nothing.
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);

    const after = await prismaRaw.institute.findUnique({ where: { id: instituteId } });
    expect(after.currentPeriodEnd?.toISOString()).toBe(before.currentPeriodEnd?.toISOString());
    expect(after.paymentStatus).toBe(before.paymentStatus);
  });

  /** A subscription belongs to one school; it must not follow the wrong one. */
  it("does not let one school's subscription id reach another", async () => {
    if (skip()) return;

    await sendEvent(evt({
      eventId: `evt_prebind2_${crypto.randomUUID()}`,
      subscriptionId: `sub_bind_${instituteId}`,
      paymentStatus: "ACTIVE",
    }));

    const other = await prismaRaw.institute.findFirst({
      where: { id: { not: instituteId }, deletedAt: null },
      select: { id: true, paymentStatus: true, currentPeriodEnd: true },
    });
    if (!other) return;

    await sendEvent({
      eventId: `evt_cross_${crypto.randomUUID()}`,
      type: "subscription.payment.succeeded",
      customerRef: null,
      instituteRef: null,
      subscriptionId: `sub_bind_${instituteId}`,
      paymentStatus: "ACTIVE",
      currentPeriodEnd: "2030-01-01T00:00:00.000Z",
      occurredAt: "2029-12-01T00:00:00.000Z",
    });

    const otherAfter = await prismaRaw.institute.findUnique({ where: { id: other.id } });
    expect(otherAfter.paymentStatus).toBe(other.paymentStatus);
    expect(otherAfter.currentPeriodEnd?.toISOString()).toBe(other.currentPeriodEnd?.toISOString());
  });
});
