import { appendFileSync } from "node:fs";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/response.js";
import { audit } from "../utils/audit.js";
import { getPaymentProvider, billingEnabled } from "../services/payments/index.js";
import { applyBillingUpdate, claimEvent, releaseEvent } from "../services/payments/billing.service.js";
import { effectiveStudentLimit } from "../utils/subscription.js";
import { PLAN_PUBLIC } from "../utils/publicFields.js";

/**
 * GET /api/billing/status — what the admin's settings page shows.
 *
 * Deliberately contains no provider identifiers or secrets: an admin needs to
 * know whether they are paid up and until when, not our customer reference.
 */
export const billingStatus = asyncHandler(async (req, res) => {
  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    include: { plan: { select: PLAN_PUBLIC } },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  return ok(res, {
    online: billingEnabled(),
    paymentStatus: institute.paymentStatus,
    currentPeriodEnd: institute.currentPeriodEnd,
    trialEndsAt: institute.trialEndsAt,
    cancelAtPeriodEnd: institute.cancelAtPeriodEnd,
    plan: institute.plan
      ? { id: institute.plan.id, name: institute.plan.name, price: institute.plan.price }
      : null,
    studentLimit: effectiveStudentLimit(institute),
  });
});

/**
 * POST /api/billing/checkout-session — start a payment.
 *
 * Returns a URL on the gateway's domain. Card details are entered there and
 * never reach this server, so there is nothing here that could store a PAN
 * even by accident.
 *
 * The URLs the browser comes back to are informational only. Access is granted
 * by the webhook and nothing else — see `handleWebhook`.
 */
export const createCheckoutSession = asyncHandler(async (req, res) => {
  const institute = await prisma.institute.findUnique({
    where: { id: req.instituteId },
    include: { plan: { select: PLAN_PUBLIC } },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  const planId = req.body?.planId ?? institute.planId;
  const plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true } });
  if (!plan) throw ApiError.badRequest("That plan does not exist or is no longer offered");

  const provider = await getPaymentProvider();

  const session = await provider.createCheckout({
    institute,
    plan,
    successUrl: `${env.appUrl}/billing/pending`,
    cancelUrl: `${env.appUrl}/billing/cancelled`,
  });

  // Record the customer reference so the webhook can find this institute
  // later. This is an identifier, not a credential, and grants nothing on
  // its own — payment state still only moves on a verified event.
  if (session.customerId) {
    await prisma.institute.update({
      where: { id: institute.id },
      data: { paymentProvider: provider.name, providerCustomerId: session.customerId },
    });
  }

  audit(req, {
    action: "billing.checkout_started",
    entity: "Institute",
    entityId: institute.id,
    meta: { planId: plan.id, provider: provider.name },
  });

  return ok(res, { url: session.url }, "Continue to the payment page to complete your subscription.");
});

/** POST /api/billing/cancel — stop renewing at the end of the paid period. */
export const cancelSubscription = asyncHandler(async (req, res) => {
  const institute = await prisma.institute.findUnique({ where: { id: req.instituteId } });
  if (!institute) throw ApiError.notFound("Institute not found");

  if (institute.providerSubscriptionId) {
    const provider = await getPaymentProvider();
    await provider.cancelSubscription(institute.providerSubscriptionId);
  }

  // The end-of-period flag is the same one the manual flow uses, so a school
  // that pays by transfer and one that pays by card cancel identically.
  const updated = await prisma.institute.update({
    where: { id: institute.id },
    data: { cancelAtPeriodEnd: true },
  });

  audit(req, { action: "billing.cancel_requested", entity: "Institute", entityId: institute.id });

  return ok(
    res,
    { cancelAtPeriodEnd: true, currentPeriodEnd: updated.currentPeriodEnd },
    "Your subscription will not renew. Nothing is removed and access continues until the end of the paid period."
  );
});

/**
 * Sandbox diagnostic: append a delivery's raw bytes and headers to a file.
 *
 * Deliberately runs BEFORE verification, because the question it exists to
 * answer is what the signature covers — Safepay's documentation says the raw
 * body, their own SDK signs `JSON.stringify(body.data)`, and only a real
 * delivery settles it. A rejected event that left no trace would answer
 * nothing.
 *
 * This changes no security behaviour: verification still runs immediately
 * after, an unverified event is still refused, and nothing here can grant
 * access. It only writes bytes to a file.
 *
 * Off unless `SAFEPAY_CAPTURE_WEBHOOKS` names a path, and production refuses to
 * start at all while it is set — captured payloads carry payer details and a
 * valid signature.
 */
function captureRawDelivery(req) {
  const target = env.payments.captureWebhooksTo;
  if (!target || env.isProd) return;

  try {
    appendFileSync(
      target,
      JSON.stringify({
        at: new Date().toISOString(),
        ip: req.ip,
        headers: req.headers,
        rawBodyBase64: Buffer.isBuffer(req.body) ? req.body.toString("base64") : null,
      }) + "\n"
    );
  } catch (err) {
    // A diagnostic must never be the reason a payment confirmation is lost.
    console.warn(`[billing] could not capture webhook delivery: ${err.message}`);
  }
}

/**
 * POST /api/billing/webhook/:provider — the only thing that grants paid access.
 *
 * Mounted with a raw body parser and outside the general rate limiter. The
 * order of operations matters and is deliberate:
 *
 *   1. verify the signature over the RAW bytes — an unverifiable event is
 *      discarded before it can influence anything;
 *   2. claim the event id — a duplicate delivery stops here;
 *   3. apply, with the ordering and forward-only rules in billing.service.
 *
 * Always answers 2xx once the event is genuinely ours, including for events we
 * ignore: a non-2xx tells the gateway to retry, and retrying an event that was
 * correctly ignored achieves nothing but load.
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  const provider = await getPaymentProvider();

  captureRawDelivery(req);

  let event;
  try {
    // Awaited because a provider may need to load its SDK before it can
    // verify; a synchronous implementation resolves immediately.
    event = await provider.verifySignature({ rawBody: req.body, headers: req.headers });
  } catch (err) {
    // Deliberately terse: an attacker probing the endpoint learns nothing
    // about why their forgery failed. The detail goes to the log.
    console.warn(`[billing] rejected unverified webhook from ${req.ip}: ${err.message}`);
    throw ApiError.badRequest("Invalid webhook signature");
  }

  const first = await claimEvent({
    provider: provider.name,
    eventId: event.eventId,
    type: event.type,
  });
  if (!first) {
    return ok(res, { duplicate: true }, "Event already processed");
  }

  /**
   * The claim is released if the work below fails.
   *
   * Claiming first is what makes two simultaneous deliveries safe, but it used
   * to be permanent: if mapping or applying then threw — a database blip, a
   * deadlock, a payload shape nobody expected — the row stayed. The gateway
   * retried, `claimEvent` answered "already processed", and the retry was
   * dropped with a 200.
   *
   * Reproduced end to end: a school paid, the first delivery failed once, the
   * retry was acknowledged as a duplicate, and the institute sat at UNPAID with
   * no period end — permanently, because no further delivery would ever come.
   * That is a paid school losing access, which is the worst thing this endpoint
   * can do.
   *
   * So a failure un-claims the event before the error propagates, and the
   * gateway's next attempt does the work. An event deliberately *ignored*
   * (`toBillingUpdate` returning null) keeps its claim: that is a decision, not
   * a failure, and re-examining it on every retry would be pointless.
   */
  let update;
  let result;
  try {
    update = provider.toBillingUpdate(event);
    if (!update) {
      return ok(res, { ignored: true }, "Event acknowledged");
    }
    result = await applyBillingUpdate(update, { provider: provider.name });
  } catch (err) {
    await releaseEvent({ provider: provider.name, eventId: event.eventId });
    console.error(
      `[billing] event ${event.eventId} failed and was released for retry: ${err.message}`
    );
    throw err;
  }

  if (result.applied) {
    audit(
      { ip: req.ip, user: null, instituteId: result.institute?.id },
      {
        action: "billing.updated",
        entity: "Institute",
        entityId: result.institute?.id ?? null,
        meta: {
          provider: provider.name,
          eventType: event.type,
          paymentStatus: update.paymentStatus,
          currentPeriodEnd: result.institute?.currentPeriodEnd ?? null,
        },
      }
    );
  } else {
    console.warn(`[billing] event ${event.eventId} not applied: ${result.reason}`);
  }

  return ok(res, { applied: result.applied, reason: result.reason ?? null }, "Event processed");
});
