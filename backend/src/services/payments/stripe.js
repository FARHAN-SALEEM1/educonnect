import { env } from "../../config/env.js";
import { SignatureError } from "./provider.js";

/**
 * Stripe adapter — written, unverified, inert until credentials exist.
 *
 * ⚠ Stripe does not operate in Pakistan, so it is not yet known whether this
 * product can use it at all. Nothing selects this provider unless
 * PAYMENT_PROVIDER=stripe, and the module is only imported when it is, so an
 * install without the `stripe` package is unaffected.
 *
 * It has NOT been tested against real Stripe traffic. The mapping below
 * follows Stripe's documented event shapes, but treat it as a draft until it
 * has run against `stripe listen` with a real test account.
 */

let client = null;

/**
 * The SDK is loaded lazily and by name so that a build without `stripe`
 * installed still starts — which is the normal case here.
 */
async function stripeClient() {
  if (client) return client;
  const { default: Stripe } = await import("stripe");
  client = new Stripe(env.payments.stripe.secretKey);
  return client;
}

/** Stripe subscription states → our provider-neutral vocabulary. */
const STATUS_MAP = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "UNPAID",
  incomplete_expired: "CANCELED",
  paused: "PAST_DUE",
};

const toDate = (unixSeconds) => (unixSeconds ? new Date(unixSeconds * 1000) : null);
const periodKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const stripeProvider = {
  name: "STRIPE",

  async createCheckout({ institute, plan, successUrl, cancelUrl }) {
    const priceId = plan.providerPriceIds?.STRIPE;
    if (!priceId) {
      throw new Error(`Plan "${plan.id}" has no STRIPE price id in providerPriceIds`);
    }

    const stripe = await stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Reusing the customer keeps one billing history per school.
      ...(institute.providerCustomerId
        ? { customer: institute.providerCustomerId }
        : { customer_email: institute.email }),
      client_reference_id: institute.id,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return { url: session.url, customerId: session.customer ?? null };
  },

  /**
   * Verified over the raw request bytes. `rawBody` must be the Buffer the
   * route captured before any JSON parsing.
   */
  async verifySignature({ rawBody, headers }) {
    if (!env.payments.stripe.webhookSecret) {
      throw new SignatureError("STRIPE_WEBHOOK_SECRET is not configured");
    }

    try {
      const stripe = await stripeClient();
      const event = stripe.webhooks.constructEvent(
        rawBody,
        headers["stripe-signature"],
        env.payments.stripe.webhookSecret
      );
      return {
        eventId: event.id,
        type: event.type,
        occurredAt: toDate(event.created),
        data: event.data.object,
      };
    } catch (err) {
      throw new SignatureError(err.message);
    }
  },

  toBillingUpdate(event) {
    const o = event.data;

    switch (event.type) {
      case "checkout.session.completed":
        return {
          customerRef: o.customer,
          subscriptionId: o.subscription ?? null,
          paymentStatus: "ACTIVE",
          currentPeriodEnd: null,
          occurredAt: event.occurredAt,
          invoice: null,
        };

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return {
          customerRef: o.customer,
          subscriptionId: o.id,
          paymentStatus:
            event.type === "customer.subscription.deleted"
              ? "CANCELED"
              : (STATUS_MAP[o.status] ?? "UNPAID"),
          currentPeriodEnd: toDate(o.current_period_end),
          priceRef: o.items?.data?.[0]?.price?.id ?? null,
          occurredAt: event.occurredAt,
          invoice: null,
        };

      case "invoice.paid": {
        const end = toDate(o.lines?.data?.[0]?.period?.end) ?? event.occurredAt;
        return {
          customerRef: o.customer,
          subscriptionId: o.subscription ?? null,
          paymentStatus: "ACTIVE",
          currentPeriodEnd: end,
          priceRef: o.lines?.data?.[0]?.price?.id ?? null,
          occurredAt: event.occurredAt,
          invoice: {
            period: periodKey(event.occurredAt ?? new Date()),
            // Stripe amounts are in the currency's minor unit.
            amount: Math.round((o.amount_paid ?? 0) / 100),
            paid: true,
          },
        };
      }

      case "invoice.payment_failed":
        return {
          customerRef: o.customer,
          subscriptionId: o.subscription ?? null,
          paymentStatus: "PAST_DUE",
          currentPeriodEnd: null, // never shorten access on a failure
          occurredAt: event.occurredAt,
          invoice: null,
        };

      default:
        return null; // acknowledged, not acted on
    }
  },

  async cancelSubscription(subscriptionId) {
    const stripe = await stripeClient();
    // At period end, never immediately — the month is already paid for.
    return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  },
};
