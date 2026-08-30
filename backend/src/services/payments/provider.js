/**
 * The contract every payment gateway implements.
 *
 * Stripe does not operate in Pakistan, so which gateway this product can
 * actually use is still undecided. Everything above this line therefore talks
 * only in the vocabulary below — `PaymentProvider.NONE`, a `currentPeriodEnd`,
 * a normalised event — and never in Stripe's. Adding Safepay or PayFast later
 * is one new file implementing these five functions, plus a row of config.
 * It is not a migration and it is not a change to the billing logic.
 *
 * A provider must:
 *
 *   name          → the `PaymentProvider` enum value it satisfies.
 *
 *   createCheckout({ institute, plan, successUrl, cancelUrl })
 *                 → { url, customerId? }
 *                   A hosted page the browser is redirected to. Card details
 *                   are entered there, on the gateway's domain, and never
 *                   reach this server — which is the entire reason for using
 *                   hosted checkout rather than collecting card fields.
 *
 *   verifySignature({ rawBody, headers })
 *                 → the parsed event, or throws.
 *                   MUST be computed over the raw bytes. Re-serialising a
 *                   parsed body changes key order and whitespace, and the
 *                   signature stops matching for reasons that look like
 *                   anything except the real cause.
 *
 *   toBillingUpdate(event)
 *                 → BillingUpdate | null
 *                   Translates a provider event into the shape below. Return
 *                   null for events this system does not care about; they are
 *                   still recorded as processed so they are not retried.
 *
 *   cancelSubscription(subscriptionId)
 *                 → cancels at period end, never immediately: the school has
 *                   paid for the rest of the month.
 *
 * BillingUpdate:
 *   {
 *     customerRef       string     — matches Institute.providerCustomerId
 *     subscriptionId    string?    — stored when first seen
 *     paymentStatus     PaymentStatus
 *     currentPeriodEnd  Date?      — only ever moved forward by the caller
 *     occurredAt        Date       — when the GATEWAY emitted it, not when we
 *                                    received it; this is what orders events
 *     invoice           { period, amount, paid } | null
 *   }
 */

/** Thrown when a webhook cannot be proved to have come from the gateway. */
export class SignatureError extends Error {
  constructor(message = "Webhook signature verification failed") {
    super(message);
    this.name = "SignatureError";
  }
}

/** Every field a provider module must supply. */
export const REQUIRED_METHODS = [
  "createCheckout",
  "verifySignature",
  "toBillingUpdate",
  "cancelSubscription",
];

/**
 * Fails loudly at startup rather than at the first webhook, which is the worst
 * possible moment to discover a provider is half-implemented.
 */
export const assertProviderShape = (provider) => {
  if (!provider?.name) throw new Error("Payment provider is missing a name");
  const missing = REQUIRED_METHODS.filter((m) => typeof provider[m] !== "function");
  if (missing.length) {
    throw new Error(`Payment provider "${provider.name}" is missing: ${missing.join(", ")}`);
  }
  return provider;
};
