import { beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  ALL_2_0_0,
  SUBSCRIPTION_CANCELED,
  SUBSCRIPTION_CREATED,
  SUBSCRIPTION_PAYMENT_FAILED,
  SUBSCRIPTION_PAYMENT_SUCCEEDED,
  SECOND_DELIVERIES,
} from "./fixtures/safepay-subscription-2.0.0.js";

/**
 * The Safepay adapter, exercised directly.
 *
 * This is deliberately NOT a claim that the integration works: no Safepay
 * account exists, so nothing here has spoken to Safepay. What it does prove is
 * that our half behaves — that a real HMAC-SHA512 over Safepay's own signing
 * scheme is accepted, that anything else is refused, and that a subscription
 * object shaped like `SubscriptionProps` in their published SDK maps onto the
 * billing vocabulary correctly.
 *
 * The end-to-end questions — does the envelope carry an event id, does it carry
 * a timestamp, does cancel defer to period end — can only be answered against
 * the sandbox and are listed in DEPLOYMENT.md.
 */

const SECRET = "safepay-test-webhook-secret";
let safepay;

beforeAll(async () => {
  process.env.SAFEPAY_WEBHOOK_SECRET = SECRET;
  process.env.SAFEPAY_API_KEY = "sandbox-key";
  process.env.SAFEPAY_ENVIRONMENT = "sandbox";
  safepay = (await import("../src/services/payments/safepay.js")).safepayProvider;
});

/** Signs exactly the way Safepay's SDK does: HMAC-SHA512 over stringify(data). */
const sign = (data) =>
  crypto.createHmac("sha512", SECRET).update(Buffer.from(JSON.stringify(data))).digest("hex");

const envelope = (data) => Buffer.from(JSON.stringify({ data }));

const subscription = (over = {}) => ({
  token: "sub_abc123",
  user_id: "usr_xyz789",
  reference: "inst_school_1",
  status: "ACTIVE",
  price_amount: "12999",
  price_currency: "PKR",
  current_period_start_date: "2026-08-01T00:00:00Z",
  current_period_end_date: "2026-09-01T00:00:00Z",
  updated_at: "2026-08-15T10:00:00Z",
  created_at: "2026-08-01T00:00:00Z",
  cancel_at_period_end: false,
  plan: { token: "plan_growth_pkr" },
  ...over,
});

const verify = (data, headers = {}) =>
  safepay.verifySignature({
    rawBody: envelope(data),
    headers: { "x-sfpy-signature": sign(data), ...headers },
  });

describe("signature verification", () => {
  it("accepts a correctly signed payload", async () => {
    const data = subscription();
    const event = await verify(data);
    expect(event.data.token).toBe("sub_abc123");
  });

  it("rejects a forged signature", async () => {
    const data = subscription();
    await expect(
      safepay.verifySignature({ rawBody: envelope(data), headers: { "x-sfpy-signature": "deadbeef" } })
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a missing signature header", async () => {
    await expect(
      safepay.verifySignature({ rawBody: envelope(subscription()), headers: {} })
    ).rejects.toThrow(/X-SFPY-SIGNATURE/i);
  });

  /**
   * The signature covers the data object, so altering any field inside it must
   * invalidate the digest — this is what stops a replayer editing an amount or
   * a period end.
   */
  it("rejects a tampered field whose signature was valid for the original", async () => {
    const original = subscription();
    const signature = sign(original);
    const tampered = { ...original, current_period_end_date: "2030-01-01T00:00:00Z" };

    await expect(
      safepay.verifySignature({
        rawBody: envelope(tampered),
        headers: { "x-sfpy-signature": signature },
      })
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a body that is not JSON", async () => {
    await expect(
      safepay.verifySignature({ rawBody: Buffer.from("not json"), headers: { "x-sfpy-signature": "x" } })
    ).rejects.toThrow(/JSON/i);
  });

  it("rejects a body with no data object", async () => {
    const body = Buffer.from(JSON.stringify({ nope: true }));
    await expect(
      safepay.verifySignature({ rawBody: body, headers: { "x-sfpy-signature": "x" } })
    ).rejects.toThrow(/data object/i);
  });

  it("refuses to verify when no webhook secret is configured", async () => {
    const saved = process.env.SAFEPAY_WEBHOOK_SECRET;
    process.env.SAFEPAY_WEBHOOK_SECRET = "";
    // env is read at module load, so assert against a freshly imported copy.
    const { env } = await import("../src/config/env.js");
    const original = env.payments.safepay.webhookSecret;
    env.payments.safepay.webhookSecret = "";

    await expect(verify(subscription())).rejects.toThrow(/not configured/i);

    env.payments.safepay.webhookSecret = original;
    process.env.SAFEPAY_WEBHOOK_SECRET = saved;
  });
});

describe("idempotency and ordering keys", () => {
  /**
   * The envelope is outside the signature, so an id taken from it could be
   * varied by a replayer to defeat the idempotency index. The adapter derives
   * the id from the signed bytes instead; this pins that behaviour.
   */
  it("derives the same event id for a byte-identical replay", async () => {
    const data = subscription();
    const first = await verify(data);
    const second = await verify(data);
    expect(first.eventId).toBe(second.eventId);
  });

  it("derives a different event id when the signed data differs", async () => {
    const a = await verify(subscription());
    const b = await verify(subscription({ status: "PAST_DUE" }));
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("ignores an event id supplied in the unsigned envelope", async () => {
    const data = subscription();
    const signature = sign(data);

    const withEnvelopeId = Buffer.from(JSON.stringify({ event_id: "attacker-chosen", data }));
    const event = await safepay.verifySignature({
      rawBody: withEnvelopeId,
      headers: { "x-sfpy-signature": signature },
    });

    expect(event.eventId).not.toContain("attacker-chosen");
    expect(event.eventId).toBe((await verify(data)).eventId);
  });

  it("takes the emission time from the signed subscription, not the envelope", async () => {
    const event = await verify(subscription({ updated_at: "2026-08-15T10:00:00Z" }));
    expect(event.occurredAt.toISOString()).toBe("2026-08-15T10:00:00.000Z");
  });

  it("falls back to null when the subscription carries no timestamp at all", async () => {
    const event = await verify(
      subscription({ updated_at: undefined, created_at: undefined, last_paid_date: undefined })
    );
    expect(event.occurredAt).toBeNull(); // the service then uses receipt time
  });
});

describe("subscription mapping", () => {
  const mapped = async (over) => safepay.toBillingUpdate(await verify(subscription(over)));

  it("maps an active subscription onto paid state", async () => {
    const update = await mapped();
    expect(update.paymentStatus).toBe("ACTIVE");
    expect(update.customerRef).toBe("usr_xyz789");
    expect(update.subscriptionId).toBe("sub_abc123");
    expect(update.currentPeriodEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(update.priceRef).toBe("plan_growth_pkr");
  });

  it("carries the checkout reference so the first event can find the school", async () => {
    const update = await mapped();
    expect(update.instituteRef).toBe("inst_school_1");
  });

  it("translates Safepay's spelling of trialing", async () => {
    expect((await mapped({ status: "TRAILING" })).paymentStatus).toBe("TRIALING");
  });

  it.each([
    ["PAST_DUE", "PAST_DUE"],
    ["PAUSED", "PAST_DUE"],
    ["UNPAID", "UNPAID"],
    ["INCOMPLETE", "UNPAID"],
    ["CANCELED", "CANCELED"],
    ["ENDED", "CANCELED"],
    ["INCOMPLETE_EXPIRED", "CANCELED"],
  ])("maps %s onto %s", async (safepayStatus, expected) => {
    expect((await mapped({ status: safepayStatus })).paymentStatus).toBe(expected);
  });

  /**
   * An unrecognised status must never be guessed into a paid one. Returning
   * null makes the route acknowledge the event without touching billing state.
   */
  it("ignores a status it does not recognise", async () => {
    expect(await mapped({ status: "SOMETHING_NEW" })).toBeNull();
    expect(await mapped({ status: "NONE_SUBSCRIPTION_STATUS" })).toBeNull();
  });

  it("never shortens access on a failed payment", async () => {
    const update = await mapped({ status: "PAST_DUE" });
    expect(update.currentPeriodEnd).toBeNull();
  });

  it("records a paid invoice for the billing period", async () => {
    const update = await mapped();
    expect(update.invoice).toEqual({ period: "2026-08", amount: 12999, paid: true });
  });

  it("writes no invoice for a subscription that has not paid", async () => {
    expect((await mapped({ status: "UNPAID" })).invoice).toBeNull();
  });
});

describe("checkout", () => {
  const plan = { id: "growth", providerPriceIds: { SAFEPAY: "plan_growth_pkr" } };
  const institute = { id: "inst_school_1", email: "admin@school.test" };

  it("refuses a plan with no Safepay token rather than charging the wrong thing", async () => {
    await expect(
      safepay.createCheckout({
        institute,
        plan: { id: "growth", providerPriceIds: {} },
        successUrl: "https://app.test/billing/pending",
        cancelUrl: "https://app.test/billing/cancelled",
      })
    ).rejects.toThrow(/no SAFEPAY plan token/i);
  });

  /**
   * The auth-token call is the only network hop before the URL is built, so it
   * is stubbed. Everything asserted below is our own construction.
   */
  it("builds a sandbox subscription URL carrying the institute reference", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: "auth-token-123" }) });

    try {
      const { url, customerId } = await safepay.createCheckout({
        institute,
        plan,
        successUrl: "https://app.test/billing/pending",
        cancelUrl: "https://app.test/billing/cancelled",
      });

      const parsed = new URL(url);
      expect(parsed.origin).toBe("https://sandbox.api.getsafepay.com");
      expect(parsed.pathname).toBe("/checkout/subscribe");
      expect(parsed.searchParams.get("plan_id")).toBe("plan_growth_pkr");
      expect(parsed.searchParams.get("reference")).toBe("inst_school_1");
      expect(parsed.searchParams.get("env")).toBe("sandbox");
      expect(customerId).toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("never puts the merchant secret in the checkout URL", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: "auth-token-123" }) });

    try {
      const { url } = await safepay.createCheckout({
        institute,
        plan,
        successUrl: "https://app.test/ok",
        cancelUrl: "https://app.test/no",
      });
      expect(url).not.toContain("sandbox-key");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

/**
 * What the signature actually covers.
 *
 * Safepay's documentation says the raw request body is signed. Their published
 * Node SDK signs `JSON.stringify(request.body.data)`. The docs site is not
 * reachable from this network and no real delivery has ever arrived, so the
 * contradiction cannot be settled — it can only be survived.
 *
 * Committing to one scheme and being wrong would reject every genuine event:
 * no payment would ever apply, and the log would blame cryptography rather
 * than the guess. So both are accepted, which costs nothing — each is
 * HMAC-SHA512 under the same secret, so an attacker still needs the secret.
 */
describe("both candidate signature schemes", () => {
  /** The raw bytes of a whole envelope, including fields outside `data`. */
  const wholeEnvelope = (data, extra = {}) =>
    Buffer.from(JSON.stringify({ ...extra, data }));

  const signBytes = (bytes) =>
    crypto.createHmac("sha512", SECRET).update(bytes).digest("hex");

  it("accepts the SDK scheme, and says which one matched", async () => {
    const data = { subscription: subscription() };
    const event = await verify(data);
    expect(event.signedOver).toBe("data");
  });

  it("accepts the documented scheme — a digest over the raw body", async () => {
    const data = { subscription: subscription() };
    const body = wholeEnvelope(data, { id: "evt_1", type: "subscription.updated" });

    const event = await safepay.verifySignature({
      rawBody: body,
      headers: { "x-sfpy-signature": signBytes(body) },
    });

    expect(event.signedOver).toBe("raw-body");
    expect(event.data.subscription.token).toBe("sub_abc123");
  });

  /**
   * The id must not depend on which scheme happened to verify, or the same
   * event redelivered under the other one would be processed twice.
   */
  it("derives the same event id whichever scheme verified it", async () => {
    const data = { subscription: subscription() };
    const bySdk = await verify(data);

    const body = wholeEnvelope(data, { id: "evt_1" });
    const byRaw = await safepay.verifySignature({
      rawBody: body,
      headers: { "x-sfpy-signature": signBytes(body) },
    });

    expect(byRaw.signedOver).not.toBe(bySdk.signedOver);
    expect(byRaw.eventId).toBe(bySdk.eventId);
  });

  /** Accepting two schemes must not become accepting anything. */
  it("still rejects a digest over something neither scheme signs", async () => {
    const data = { subscription: subscription() };
    await expect(
      safepay.verifySignature({
        rawBody: wholeEnvelope(data),
        headers: { "x-sfpy-signature": signBytes(Buffer.from("some other bytes")) },
      })
    ).rejects.toThrow(/does not match/i);
  });

  it("still rejects a valid digest made with the wrong secret", async () => {
    const data = { subscription: subscription() };
    const body = wholeEnvelope(data);
    const wrong = crypto.createHmac("sha512", "not-the-secret").update(body).digest("hex");

    await expect(
      safepay.verifySignature({ rawBody: body, headers: { "x-sfpy-signature": wrong } })
    ).rejects.toThrow(/does not match/i);
  });

  /**
   * Under raw-body signing the envelope is covered too, so tampering with a
   * field outside `data` has to fail rather than fall back to the SDK scheme
   * and pass.
   */
  it("rejects an envelope edited after it was signed over the raw body", async () => {
    const data = { subscription: subscription() };
    const original = wholeEnvelope(data, { id: "evt_1" });
    const signature = signBytes(original);
    const tampered = wholeEnvelope(data, { id: "evt_MINE" });

    await expect(
      safepay.verifySignature({ rawBody: tampered, headers: { "x-sfpy-signature": signature } })
    ).rejects.toThrow(/does not match/i);
  });
});

/**
 * Safepay's 2.0.0 subscription events, against their own captured payloads.
 *
 * Everything below runs on bytes Safepay actually sent — field names, nesting,
 * protobuf timestamps and status vocabulary are theirs. The adapter was
 * written against their SDK types before any of this arrived, and almost
 * every assumption in it turned out to be wrong:
 *
 *   • the event id and type live on the envelope, not inside `data`
 *   • the subscription id is `id`, not `token`
 *   • dates are protobuf `{ seconds, nanos }`, not ISO strings
 *   • 2.0.0 signs the raw body; 1.0.0 signs `data`
 *
 * The dates one was the dangerous one: `new Date({seconds})` is Invalid Date,
 * so every paid subscription would have applied with no period end and left
 * the school locked out after paying.
 */
describe("Safepay 2.0.0 subscription events", () => {
  /** 2.0.0 signs the raw request body — verified live against the real secret. */
  const deliver = (payload) => {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac("sha512", SECRET).update(rawBody).digest("hex");
    return safepay.verifySignature({ rawBody, headers: { "x-sfpy-signature": signature } });
  };

  it("verifies all four against the raw body", async () => {
    for (const payload of ALL_2_0_0) {
      const event = await deliver(payload);
      expect(event.signedOver, payload.type).toBe("raw-body");
      expect(event.version).toBe("2.0.0");
    }
  });

  it("takes the event id from the envelope's own token", async () => {
    for (const payload of ALL_2_0_0) {
      const event = await deliver(payload);
      expect(event.eventId, payload.type).toBe(payload.token);
      expect(event.eventId).toMatch(/^evt_/);
    }
  });

  it("names the event from the envelope, not from a status", async () => {
    for (const payload of ALL_2_0_0) {
      const event = await deliver(payload);
      expect(event.type).toBe(payload.type);
    }
    // The bug this replaces: `subscription.created` was reported as
    // "INCOMPLETE", because the type was read from data.status.
    const created = await deliver(SUBSCRIPTION_CREATED);
    expect(created.type).toBe("subscription.created");
    expect(created.type).not.toBe("INCOMPLETE");
  });

  it("reads the subscription id from data.id", async () => {
    for (const payload of ALL_2_0_0) {
      const update = safepay.toBillingUpdate(await deliver(payload));
      expect(update, payload.type).toBeTruthy();
      expect(update.subscriptionId).toBe(payload.data.id);
      expect(update.subscriptionId).toMatch(/^sub_/);
    }
  });

  it("maps every status Safepay actually sent", async () => {
    const seen = {};
    for (const payload of ALL_2_0_0) {
      const update = safepay.toBillingUpdate(await deliver(payload));
      seen[payload.type] = update.paymentStatus;
    }
    expect(seen).toEqual({
      "subscription.created": "UNPAID",           // INCOMPLETE
      "subscription.canceled": "CANCELED",
      "subscription.payment.succeeded": "ACTIVE",
      "subscription.payment.failed": "UNPAID",
    });
  });

  it("carries the plan so an upgrade resolves to the plan actually paid for", async () => {
    const update = safepay.toBillingUpdate(await deliver(SUBSCRIPTION_PAYMENT_SUCCEEDED));
    expect(update.priceRef).toBe(SUBSCRIPTION_PAYMENT_SUCCEEDED.data.plan_id);
  });

  describe("protobuf timestamps", () => {
    it("turns { seconds, nanos } into a real period end", async () => {
      const payload = SUBSCRIPTION_PAYMENT_SUCCEEDED;
      const update = safepay.toBillingUpdate(await deliver(payload));

      expect(update.currentPeriodEnd).toBeInstanceOf(Date);
      expect(update.currentPeriodEnd.getTime()).toBe(
        payload.data.current_period_end_date.seconds * 1000
      );
    });

    /**
     * The whole point. Without this the period was Invalid Date, the service
     * skipped it as absent, and a school that had paid never got a paid-until.
     */
    it("does not leave a paid subscription with no period at all", async () => {
      const update = safepay.toBillingUpdate(await deliver(SUBSCRIPTION_PAYMENT_SUCCEEDED));
      expect(update.paymentStatus).toBe("ACTIVE");
      expect(update.currentPeriodEnd).not.toBeNull();
      expect(Number.isNaN(update.currentPeriodEnd.getTime())).toBe(false);
    });

    it("orders events by the emission time inside the payload", async () => {
      const event = await deliver(SUBSCRIPTION_PAYMENT_SUCCEEDED);
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.occurredAt.getTime()).toBe(
        SUBSCRIPTION_PAYMENT_SUCCEEDED.data.updated_at.seconds * 1000
      );
    });
  });

  /**
   * Their `amount` is a bare 100000 against a plan quoted at Rs. 12,999, and
   * nothing observed says whether that is rupees or paisa. A wrong figure in
   * the revenue ledger is worse than a missing row, so 2.0.0 writes none until
   * a real subscription payment settles it.
   */
  it("writes no ledger entry while the amount units are unverified", async () => {
    for (const payload of ALL_2_0_0) {
      const update = safepay.toBillingUpdate(await deliver(payload));
      expect(update.invoice, payload.type).toBeNull();
    }
  });

  /**
   * Test events from the dashboard carry no reference, no user id and no
   * metadata. Left unbound, such an event must reach no school at all —
   * inventing one from an email address or a plan id could mark the wrong
   * institute paid.
   */
  it("names no institute when the payload carries no reference", async () => {
    for (const payload of ALL_2_0_0) {
      const update = safepay.toBillingUpdate(await deliver(payload));
      expect(update.instituteRef, payload.type).toBeNull();
      expect(update.customerRef).toBeNull();
    }
  });

  it("uses a reference when one is present", async () => {
    const withRef = {
      ...SUBSCRIPTION_PAYMENT_SUCCEEDED,
      data: { ...SUBSCRIPTION_PAYMENT_SUCCEEDED.data, reference: "inst_abc123" },
    };
    const update = safepay.toBillingUpdate(await deliver(withRef));
    expect(update.instituteRef).toBe("inst_abc123");
  });
});

/**
 * Only a signature that covers the envelope makes the envelope believable.
 *
 * 2.0.0 signs the raw body, so its `token` and `type` are as trustworthy as
 * `data`. 1.0.0 signs `data` alone — anything around it can be rewritten
 * freely while the signature still checks out, so an event id or type taken
 * from there would be chosen by whoever replayed it.
 */
describe("envelope fields are only trusted when the envelope is signed", () => {
  it("ignores an envelope id and type on a data-signed event", async () => {
    const data = { subscription: subscription() };
    const rawBody = Buffer.from(JSON.stringify({
      token: "evt_ATTACKER_CHOSEN",
      type: "subscription.payment.succeeded",
      version: "2.0.0",
      data,
    }));
    // Signed over `data` only — the 1.0.0 scheme.
    const signature = crypto.createHmac("sha512", SECRET)
      .update(Buffer.from(JSON.stringify(data))).digest("hex");

    const event = await safepay.verifySignature({
      rawBody,
      headers: { "x-sfpy-signature": signature },
    });

    expect(event.signedOver).toBe("data");
    expect(event.eventId).not.toBe("evt_ATTACKER_CHOSEN");
    expect(event.type).not.toBe("subscription.payment.succeeded");
    expect(event.envelope).toBeNull();
    expect(event.version).toBeNull();
  });

  /**
   * Two replays that differ only outside `data` must not both get through the
   * idempotency index. Under data-signing the id is derived from the signed
   * bytes, so they collapse onto one event.
   */
  it("gives a data-signed replay the same id however the envelope varies", async () => {
    const data = { subscription: subscription() };
    const signature = crypto.createHmac("sha512", SECRET)
      .update(Buffer.from(JSON.stringify(data))).digest("hex");

    const idFor = async (envelopeExtra) => {
      const event = await safepay.verifySignature({
        rawBody: Buffer.from(JSON.stringify({ ...envelopeExtra, data })),
        headers: { "x-sfpy-signature": signature },
      });
      return event.eventId;
    };

    expect(await idFor({ token: "evt_one" })).toBe(await idFor({ token: "evt_two" }));
  });

  it("still reports 1.0.0 events the way it always did", async () => {
    const data = { subscription: subscription() };
    const event = await verify(data);
    expect(event.signedOver).toBe("data");
    const update = safepay.toBillingUpdate(event);
    expect(update.paymentStatus).toBe("ACTIVE");
    expect(update.subscriptionId).toBe("sub_abc123");
    expect(update.instituteRef).toBe("inst_school_1");
    // 1.0.0 ledger behaviour is untouched.
    expect(update.invoice).not.toBeNull();
    expect(update.invoice.amount).toBe(12999);
  });
});

/**
 * Two real events of one type, and a redelivery of one of them.
 *
 * Idempotency keys on the event id, so it has to do two opposite things: let
 * two genuine events through, and stop the same one twice. Both halves are
 * checked here against pairs Safepay actually sent — same type, same
 * subscription, different deliveries.
 *
 * The first half is the one that used to be at risk. Before 2.0.0 support the
 * id was a digest of the payload bytes, so two real events would have
 * collapsed onto one id had their contents matched — and the second would have
 * been dropped as a duplicate.
 */
describe("telling two real events apart from one event twice", () => {
  const deliver = (payload) => {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac("sha512", SECRET).update(rawBody).digest("hex");
    return safepay.verifySignature({ rawBody, headers: { "x-sfpy-signature": signature } });
  };

  it("gives two separate deliveries of the same type separate ids", async () => {
    for (const [first, second] of SECOND_DELIVERIES) {
      const a = await deliver(first);
      const b = await deliver(second);

      expect(a.type, "same event type expected").toBe(b.type);
      expect(a.eventId, `${a.type} ids must differ`).not.toBe(b.eventId);
      // Same subscription, so the id cannot be coming from that either.
      expect(first.data.id).toBe(second.data.id);
    }
  });

  it("gives the same delivery the same id every time", async () => {
    for (const [first] of SECOND_DELIVERIES) {
      const once = await deliver(first);
      const again = await deliver(first);
      expect(again.eventId).toBe(once.eventId);
    }
  });

  /**
   * The id is the gateway's, not a digest of ours. A payload reformatted in
   * transit — key order, whitespace — is still the same event, and Safepay
   * signs the raw body so a reformat would fail verification anyway; this pins
   * that the id does not silently depend on byte layout.
   */
  it("takes the id from the gateway rather than deriving it", async () => {
    for (const [first, second] of SECOND_DELIVERIES) {
      expect((await deliver(first)).eventId).toBe(first.token);
      expect((await deliver(second)).eventId).toBe(second.token);
    }
  });
});
