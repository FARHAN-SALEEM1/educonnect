import { env } from "../../config/env.js";
import { assertProviderShape } from "./provider.js";
import { manualProvider } from "./manual.js";

/**
 * Selects the configured payment gateway.
 *
 * `manual` is the default and needs no configuration, so an install that never
 * touches billing behaves exactly as it did before billing existed.
 *
 * Providers are registered lazily: a gateway's SDK is only imported when that
 * gateway is actually selected, so an unconfigured Stripe (or an uninstalled
 * `stripe` package) cannot break startup for a school paying by bank transfer.
 */

const REGISTRY = {
  MANUAL: async () => manualProvider,
  STRIPE: async () => (await import("./stripe.js")).stripeProvider,
  // Sandbox-only so far, and unverified against real traffic — see safepay.js.
  SAFEPAY: async () => (await import("./safepay.js")).safepayProvider,
};

let cached = null;

/** The active provider, memoised. */
export async function getPaymentProvider() {
  if (cached) return cached;

  const key = String(env.payments.provider || "manual").toUpperCase();
  const load = REGISTRY[key];

  if (!load) {
    throw new Error(
      `PAYMENT_PROVIDER="${env.payments.provider}" is not a provider this build knows about. ` +
        `Known: ${Object.keys(REGISTRY).join(", ").toLowerCase()}.`
    );
  }

  cached = assertProviderShape(await load());
  return cached;
}

/** Test seam: swap the provider, and restore it afterwards. */
export function __setProviderForTests(provider) {
  cached = provider ? assertProviderShape(provider) : null;
}

/** True when money can actually be collected online. */
export const billingEnabled = () =>
  String(env.payments.provider || "manual").toUpperCase() !== "MANUAL";
