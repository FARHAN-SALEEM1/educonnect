import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { SignatureError } from "./provider.js";

/**
 * Safepay adapter — checkout verified, webhooks not.
 *
 * Safepay (getsafepay.pk) is a Pakistani gateway that settles in PKR, which is
 * why it was chosen over Stripe: Stripe does not operate in Pakistan at all.
 * It has first-class subscriptions and hosted checkout, so it fits the provider
 * contract without bending it.
 *
 * STATUS (2026-08-29): the sandbox merchant secret in `.env` is real and works —
 * `POST /client/passport/v1/token` returns a token, and `createCheckout` produces
 * a URL Safepay's hosted page serves with a 200. So checkout is verified against
 * the real sandbox. What has still never happened is Safepay sending us a webhook:
 * that needs an endpoint registered in their dashboard and a completed sandbox
 * payment, and their sandbox payer signup is reCAPTCHA-blocked.
 *
 * ⚠ Everything below is written from Safepay's published Node SDK
 * (`@sfpy/node-sdk`) — its signature routine, its subscription object and its
 * checkout URL builder — and NOT from observed webhook traffic. Three things
 * are unconfirmed and are handled defensively rather than guessed at:
 *
 *   1. what the signature actually covers — see verifySignature,
 *   2. whether the envelope carries a unique event id, and
 *   3. whether it carries an authoritative emission timestamp.
 *
 * `PAYMENT_PROVIDER=manual` remains the default until a real event has been
 * seen arriving and applying.
 */

const SUBSCRIPTION_PATH = "/subscriptions/v1";
const PASSPORT_PATH = "/passport/v1/token";

/** Sandbox is the default: an unconfigured deployment must never reach live money. */
const HOSTS = {
  sandbox: { api: "https://sandbox.api.getsafepay.com/client", checkout: "https://sandbox.api.getsafepay.com/checkout" },
  development: { api: "https://dev.api.getsafepay.com/client", checkout: "https://dev.api.getsafepay.com/checkout" },
  production: { api: "https://api.getsafepay.com/client", checkout: "https://getsafepay.com/checkout" },
};

const environment = () => {
  const value = String(env.payments.safepay.environment || "sandbox").toLowerCase();
  return HOSTS[value] ? value : "sandbox";
};

const hosts = () => HOSTS[environment()];

/**
 * Safepay's subscription vocabulary → ours.
 *
 * `TRAILING` is their spelling of "trialing", kept verbatim so a payload match
 * is obvious. Anything unmapped returns null from `toBillingUpdate`, which the
 * route acknowledges without acting on — an unknown state must never be guessed
 * into a paid one.
 */
const STATUS_MAP = {
  ACTIVE: "ACTIVE",
  TRAILING: "TRIALING",
  TRIALING: "TRIALING",
  PAST_DUE: "PAST_DUE",
  PAUSED: "PAST_DUE",
  UNPAID: "UNPAID",
  INCOMPLETE: "UNPAID",
  CANCELED: "CANCELED",
  CANCELLED: "CANCELED",
  ENDED: "CANCELED",
  INCOMPLETE_EXPIRED: "CANCELED",
};

/**
 * A Safepay timestamp, in either of the two forms they send.
 *
 * 1.0.0 events carry ISO strings. 2.0.0 events carry protobuf timestamps —
 * `{ seconds, nanos }` — which `new Date()` reads as Invalid Date. That was
 * not a cosmetic problem: `current_period_end_date` is what grants paid
 * access, so every 2.0.0 subscription would have applied with no period at
 * all and the school would have stayed locked out after paying.
 *
 * Nanoseconds are dropped rather than rounded. The field they matter to is a
 * billing period boundary measured in days.
 */
const toDate = (value) => {
  if (!value) return null;

  if (typeof value === "object" && value !== null && "seconds" in value) {
    const seconds = Number(value.seconds);
    if (!Number.isFinite(seconds)) return null;
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const periodKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/** Safepay quotes amounts as strings; the ledger stores whole rupees. */
const toAmount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

async function api(path, { method = "post", body = {} } = {}) {
  const res = await fetch(`${hosts().api}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-SFPY-MERCHANT-SECRET": env.payments.safepay.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // The body may carry a reason, but it may also carry account detail, so
    // only the status is surfaced; the rest goes to the log.
    const detail = await res.text().catch(() => "");
    console.error(`[safepay] ${method.toUpperCase()} ${path} -> ${res.status}: ${detail.slice(0, 500)}`);
    throw new Error(`Safepay request failed with status ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  return json?.data ?? json;
}

export const safepayProvider = {
  name: "SAFEPAY",

  /**
   * Hosted subscription checkout.
   *
   * Two calls: mint a short-lived auth token, then build the hosted URL. Card
   * details are entered on Safepay's page and never touch this server.
   *
   * `reference` carries our institute id. It is the only thing tying the first
   * webhook back to a school, because Safepay issues no customer identifier
   * until a payment has actually gone through.
   */
  async createCheckout({ institute, plan, successUrl, cancelUrl }) {
    const planToken = plan.providerPriceIds?.SAFEPAY;
    if (!planToken) {
      throw new Error(
        `Plan "${plan.id}" has no SAFEPAY plan token in providerPriceIds. ` +
          `Create the plan in the Safepay dashboard and record its token before enabling checkout.`
      );
    }

    const authToken = await api(PASSPORT_PATH);
    if (!authToken || typeof authToken !== "string") {
      throw new Error("Safepay did not return an authorization token");
    }

    const params = new URLSearchParams({
      plan_id: planToken,
      auth_token: authToken,
      env: environment(),
      cancel_url: cancelUrl,
      redirect_url: successUrl,
      reference: institute.id,
    });

    // No customerId: Safepay has not issued one at this point. The institute is
    // matched from `reference` on the first event instead, and bound to a real
    // customer id from that event onward.
    return { url: `${hosts().checkout}/subscribe?${params.toString()}`, customerId: null };
  },

  /**
   * Verifies `X-SFPY-SIGNATURE`, an HMAC-SHA512 digest.
   *
   * Safepay's own sources disagree about what is signed — their docs say the
   * raw request body, their SDK signs `JSON.stringify(body.data)` — so both
   * are checked. The reasoning is at the comparison itself.
   *
   * Whichever matched, this adapter reads nothing outside `data`: under the
   * SDK scheme the envelope is unsigned and therefore attacker-controlled, and
   * being conservative costs nothing under the other. So not the event id, not
   * the type, not a timestamp — see `eventIdFor` below.
   *
   * Re-serialising `data` is safe because `JSON.parse` preserves key order for
   * string keys, so `stringify(parse(x))` reproduces Safepay's own bytes.
   */
  async verifySignature({ rawBody, headers }) {
    const secret = env.payments.safepay.webhookSecret;
    if (!secret) throw new SignatureError("SAFEPAY_WEBHOOK_SECRET is not configured");

    const provided = headers["x-sfpy-signature"];
    if (!provided || typeof provided !== "string") {
      throw new SignatureError("missing X-SFPY-SIGNATURE header");
    }

    let envelope;
    try {
      envelope = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody));
    } catch {
      throw new SignatureError("webhook body is not valid JSON");
    }

    if (!envelope || typeof envelope !== "object" || !("data" in envelope)) {
      throw new SignatureError("webhook body has no data object to verify");
    }

    /**
     * Two candidate schemes, because Safepay's own sources disagree.
     *
     * Their documentation says the raw request body is signed. Their published
     * Node SDK signs `JSON.stringify(request.body.data)`. The docs site is not
     * reachable from here to settle it, and no real delivery has ever arrived.
     *
     * Committing to one and being wrong is not a small mistake: every genuine
     * event would fail verification, no payment would ever apply, and the log
     * would blame cryptography. So both are computed and either may match.
     *
     * This weakens nothing. Both are HMAC-SHA512 under the same secret, so
     * producing either still requires the secret; an attacker gains no new
     * option. It only removes the coin flip. `signedOver` records which one
     * actually matched, which is the answer the sandbox was supposed to give.
     */
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
    const dataBytes = Buffer.from(JSON.stringify(envelope.data));

    const candidates = [
      { name: "data", bytes: dataBytes },
      { name: "raw-body", bytes: raw },
    ];

    const supplied = Buffer.from(provided, "utf8");
    let matched = null;
    for (const candidate of candidates) {
      const expected = Buffer.from(
        crypto.createHmac("sha512", secret).update(candidate.bytes).digest("hex"),
        "utf8"
      );
      // Constant-time compare. Safepay's own SDK uses `===`; the length check
      // first keeps timingSafeEqual from throwing on mismatched buffers.
      if (
        supplied.length === expected.length &&
        crypto.timingSafeEqual(supplied, expected)
      ) {
        matched = candidate;
        break;
      }
    }

    if (!matched) throw new SignatureError("signature does not match");

    const data = envelope.data ?? {};

    /**
     * Whether anything outside `data` may be believed.
     *
     * Under raw-body signing the whole envelope is covered by the digest, so
     * its fields are as trustworthy as `data` itself. Under data-only signing
     * they are not covered at all and a replayer could rewrite them freely
     * while keeping a valid signature — so an event id or a type taken from
     * there would be attacker-chosen.
     *
     * Real 2.0.0 events sign the raw body and put the event id and type in the
     * envelope; real 1.0.0 events sign only `data` and put both inside it.
     * Both were observed. This flag is what keeps the second case honest.
     */
    const envelopeIsSigned = matched.name === "raw-body";

    /**
     * 2.0.0 events carry their own event id — `token` on the envelope, covered
     * by the signature. That is a real gateway id and better than anything
     * derived: it survives a field being reformatted and distinguishes two
     * events whose data happens to match.
     *
     * 1.0.0 has no signed envelope, so the id is derived from the data bytes as
     * before — and deliberately not from the raw body, or a replayer could
     * vary a byte outside `data` to slip past the idempotency index while the
     * signature still checked out.
     */
    const envelopeEventId = envelopeIsSigned && envelope.token ? String(envelope.token) : null;

    return {
      eventId: envelopeEventId ?? eventIdFor(dataBytes, data),
      /**
       * 2.0.0 names the event on the envelope (`subscription.payment.succeeded`);
       * 1.0.0 names it inside `data` (`payment:created`). Falling back to a
       * status is the last resort and only reachable for payloads with neither.
       */
      type: String(
        (envelopeIsSigned ? envelope.type : null) ??
          data.type ??
          data.status ??
          "subscription.updated"
      ),
      occurredAt: occurredAtFor(data),
      // Which scheme verified — 1.0.0 signs `data`, 2.0.0 signs the raw body.
      signedOver: matched.name,
      // Present only when the signature covers it; null keeps a caller from
      // reaching for envelope fields it is not allowed to trust.
      envelope: envelopeIsSigned ? envelope : null,
      version: envelopeIsSigned && envelope.version ? String(envelope.version) : null,
      data,
    };
  },

  /**
   * A Safepay subscription object → a BillingUpdate.
   *
   * Field names follow `SubscriptionProps` in the published SDK types.
   */
  toBillingUpdate(event) {
    const o = event.data ?? {};

    /**
     * Two payload generations, both observed.
     *
     * 2.0.0 puts the subscription straight in `data` — `id`, `status`,
     * `plan_id`, protobuf period dates — and names the event on the envelope.
     * 1.0.0 wrapped things differently and used `token`, `plan.token` and ISO
     * dates. Reading both is not defensive programming for its own sake: the
     * dashboard offers both versions and a merchant can have either enabled.
     */
    const isV2 = event.version === "2.0.0";
    const subscription = o.subscription ?? o;

    const status = STATUS_MAP[String(subscription.status ?? "").toUpperCase()];
    if (!status) return null; // unknown or non-subscription event: acknowledge, do nothing

    const periodEnd = toDate(subscription.current_period_end_date ?? subscription.end_date);
    const paid = status === "ACTIVE" || status === "TRIALING";

    /**
     * The subscription's own identifier. 2.0.0 calls it `id`; 1.0.0 called it
     * `token`. This is what binds every later event of a subscription to the
     * school once the first one has been matched — see `applyBillingUpdate`.
     */
    const subscriptionId = subscription.id ?? subscription.token ?? null;

    /**
     * The reference we put in the checkout URL, if the gateway sends it back.
     *
     * Safepay's dashboard *test* events carry no reference — no `reference`, no
     * `user_id`, no metadata of any kind. Whether a real subscription carries
     * one is unverified, because their sandbox subscription checkout stops at
     * `recaptcha_token is required` and no real one has been created.
     *
     * If it never arrives, an unbound subscription simply stays unmatched and
     * the event is recorded and ignored. That is the right failure: guessing a
     * school from an email address or a plan id could mark somebody else paid.
     */
    const instituteRef = subscription.reference ?? null;

    return {
      // Safepay's own customer identifier, once it exists. 2.0.0 sends none.
      customerRef: subscription.user_id ?? null,
      instituteRef,
      subscriptionId,
      paymentStatus: status,
      // Never shorten access on a failure; the service is forward-only anyway.
      currentPeriodEnd: status === "PAST_DUE" ? null : periodEnd,
      priceRef: subscription.plan?.token ?? subscription.plan_id ?? null,
      occurredAt: event.occurredAt,
      /**
       * No ledger entry for 2.0.0 yet.
       *
       * Their `amount` is a bare number — 100000 against a plan quoted at
       * Rs. 12,999 — and nothing observed says whether that is rupees, paisa,
       * or the test plan's own price. Writing it into the revenue ledger on a
       * guess would put a wrong figure in front of the platform owner, which is
       * worse than a missing row. 1.0.0's `price_amount` behaviour is
       * unchanged; this waits for a real subscription payment.
       */
      invoice:
        !isV2 && paid && subscription.price_amount
          ? {
              period: periodKey(
                toDate(subscription.current_period_start_date) ?? event.occurredAt ?? new Date()
              ),
              amount: toAmount(subscription.price_amount),
              paid: true,
            }
          : null,
    };
  },

  /**
   * Safepay exposes a single cancel endpoint. Their subscription object carries
   * `cancel_at_period_end`, which suggests cancellation is deferred to the end
   * of the paid period as our contract requires — but that is inference from a
   * type definition, not observed behaviour, and it is on the sandbox
   * verification list. If it turns out to cancel immediately, this must switch
   * to a `pause`-at-period-end equivalent: a school that has paid for the month
   * keeps the month.
   */
  async cancelSubscription(subscriptionId) {
    return api(`${SUBSCRIPTION_PATH}/${encodeURIComponent(subscriptionId)}/cancel`);
  },
};

/**
 * A stable idempotency key for an event.
 *
 * UNCONFIRMED: Safepay's published SDK never reads an event id, and the payload
 * envelope is undocumented, so it is not known whether one is sent. Rather than
 * invent an id — which would silently disable duplicate protection — this
 * derives one from the *signed* bytes.
 *
 * An id from the envelope is deliberately NOT used even if present: the
 * envelope is outside the signature, so a replayer could vary it to defeat the
 * idempotency index while keeping a valid signature.
 *
 * The trade-off, stated honestly: two genuinely distinct events with byte-identical
 * data collapse into one. That is safe here because applying the same state
 * twice is already a no-op — the period is forward-only and the status is
 * absolute, not a delta — but it is a weaker guarantee than a real event id,
 * and it should be replaced with `data.token`-plus-`updated_at` or a documented
 * event id once sandbox traffic shows what actually arrives.
 */
function eventIdFor(signedBytes, data) {
  const digest = crypto.createHash("sha256").update(signedBytes).digest("hex").slice(0, 40);
  const subscription = data?.subscription ?? data ?? {};
  const token = subscription.token ?? subscription.id;
  return token ? `${token}:${digest}` : digest;
}

/**
 * When the gateway emitted the event, used to order redeliveries.
 *
 * UNCONFIRMED: no envelope timestamp is documented, so this reads the
 * subscription's own `updated_at` — which is inside `data` and therefore
 * signed. Returning null falls the service back to receipt time, which orders
 * concurrent deliveries less precisely but never incorrectly: the forward-only
 * period guard still holds.
 */
function occurredAtFor(data) {
  const subscription = data?.subscription ?? data ?? {};
  return (
    toDate(subscription.updated_at) ??
    toDate(subscription.last_paid_date) ??
    toDate(subscription.created_at)
  );
}
