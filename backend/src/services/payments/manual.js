import { ApiError } from "../../utils/ApiError.js";

/**
 * The default provider: no gateway at all.
 *
 * Schools pay by bank transfer and a super admin records it against the
 * subscription invoice, exactly as before any of this existed. Nothing here
 * touches `paymentStatus` or `currentPeriodEnd`, and `accessBlock` never gates
 * a MANUAL or NONE institute on payment state — so the manual flow keeps
 * working unchanged, and the three seeded schools are unaffected.
 *
 * Checkout refuses rather than pretending: an admin asking to pay online when
 * no gateway is configured should be told so, not shown a dead page.
 */
export const manualProvider = {
  name: "MANUAL",

  async createCheckout() {
    throw ApiError.badRequest(
      "Online payment isn't enabled. Fees are settled by bank transfer and recorded by the EduConnect team."
    );
  },

  verifySignature() {
    // No gateway means no webhooks; anything arriving at that route is not ours.
    throw new Error("The manual provider does not accept webhooks");
  },

  toBillingUpdate() {
    return null;
  },

  async cancelSubscription() {
    // Cancellation is the existing end-of-period flag on the institute, which
    // the admin controls directly. Nothing external to call.
    return { cancelled: true, external: false };
  },
};
