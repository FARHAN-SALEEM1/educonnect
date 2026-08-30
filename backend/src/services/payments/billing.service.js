import { prisma } from "../../config/prisma.js";

/**
 * Applies a verified BillingUpdate to an institute.
 *
 * Everything that makes webhooks safe lives here rather than in the route, so
 * the rules hold whichever gateway is plugged in:
 *
 *   • **Idempotency** — the caller records the event id first; a duplicate
 *     never reaches this function.
 *   • **Ordering** — gateways redeliver out of order as a matter of course.
 *     An event emitted before the newest one already applied is ignored, so a
 *     late "payment_failed" cannot undo a newer "paid".
 *   • **Forward-only period** — `currentPeriodEnd` is never shortened by an
 *     event, only extended. Losing access early because a stale event arrived
 *     is worse than briefly retaining it.
 *   • **Trials end only on proof** — `trialEndsAt` is cleared exclusively when
 *     the gateway confirms an ACTIVE or TRIALING subscription. Nothing the
 *     browser says can do it.
 */

/** Statuses that mean the gateway has confirmed a live, paid-for subscription. */
const CONVERTS_TRIAL = new Set(["ACTIVE", "TRIALING"]);

/**
 * Which plan a gateway price belongs to.
 *
 * An upgrade is only real once it has been paid for, so the plan an institute
 * ends up on is derived from the price the gateway actually charged — never
 * from what the browser asked for at checkout. Prices live in
 * `Plan.providerPriceIds`, so supporting another gateway is a data change.
 */
async function planIdForPrice(priceRef) {
  if (!priceRef) return null;
  const plans = await prisma.plan.findMany({ select: { id: true, providerPriceIds: true } });
  const match = plans.find((p) =>
    Object.values(p.providerPriceIds ?? {}).includes(priceRef)
  );
  return match?.id ?? null;
}

/**
 * @returns {{ applied: boolean, reason?: string, institute?: object }}
 */
export async function applyBillingUpdate(update, { provider }) {
  /**
   * The subscription's own id, tried first.
   *
   * Safepay's 2.0.0 subscription events carry no customer identifier at all —
   * only `data.id`, the subscription. Once a school has been bound to one,
   * that id is the most direct route back to it, and `@@unique([paymentProvider,
   * providerSubscriptionId])` makes the lookup exact rather than a guess.
   *
   * Ordered ahead of the customer id because it is more specific: a school can
   * hold one customer record across several subscriptions over time, but a
   * subscription belongs to exactly one school.
   */
  let institute = update.subscriptionId
    ? await prisma.institute.findFirst({
        where: { paymentProvider: provider, providerSubscriptionId: update.subscriptionId },
      })
    : null;

  if (!institute && update.customerRef) {
    institute = await prisma.institute.findFirst({
      where: { paymentProvider: provider, providerCustomerId: update.customerRef },
    });
  }

  /**
   * Some gateways hand back no customer identifier until the first payment has
   * gone through — Safepay's subscription checkout is one — so the only thing
   * tying that first event to a school is the reference we supplied when the
   * checkout was created.
   *
   * This is a fallback, never a shortcut. A provider adapter must populate
   * `instituteRef` **only** from a field the signature actually covers;
   * otherwise anyone who could reach the endpoint could name their own target.
   * The webhook route rejects unverified events before this function is
   * reached, so by here the reference is as trustworthy as the signature.
   */
  if (!institute && update.instituteRef) {
    institute = await prisma.institute.findFirst({
      where: {
        id: update.instituteRef,
        // Never let one gateway's event redirect a school that is paying
        // through a different one.
        paymentProvider: { in: ["NONE", provider] },
      },
    });
  }

  if (!institute) {
    // Either the checkout that created this customer never completed, or the
    // event belongs to a different deployment sharing the gateway account.
    return { applied: false, reason: "no institute matches that customer" };
  }

  // Out-of-order guard. `occurredAt` is the gateway's own emission time, not
  // our receipt time, so retries and races are ordered correctly.
  if (
    institute.lastBillingEventAt &&
    update.occurredAt &&
    update.occurredAt < institute.lastBillingEventAt
  ) {
    return { applied: false, reason: "event is older than the current state", institute };
  }

  const occurredAt = update.occurredAt ?? new Date();
  const data = { paymentStatus: update.paymentStatus, lastBillingEventAt: occurredAt };

  /**
   * Bind the school to the gateway on the first event that identifies it, so
   * later events match directly and never need the reference fallback above.
   *
   * `paymentProvider` has to move with either identifier, not just the customer
   * one. Safepay's 2.0.0 subscription events carry no customer id, so a school
   * matched by reference would have been left on `NONE` while its subscription
   * id was recorded — and the lookup at the top of this function, which filters
   * on the provider, would then have missed it on every following event. The
   * school would have been re-matched by reference each time, or not at all
   * once the reference stopped arriving.
   */
  if (update.subscriptionId && institute.providerSubscriptionId !== update.subscriptionId) {
    data.providerSubscriptionId = update.subscriptionId;
    data.paymentProvider = provider;
  }

  if (update.customerRef && institute.providerCustomerId !== update.customerRef) {
    data.providerCustomerId = update.customerRef;
    data.paymentProvider = provider;
  }

  // Forward-only: an older or absent period must not shorten paid access.
  if (
    update.currentPeriodEnd &&
    (!institute.currentPeriodEnd || update.currentPeriodEnd > institute.currentPeriodEnd)
  ) {
    data.currentPeriodEnd = update.currentPeriodEnd;
  }

  // The trial ends when the gateway says money is flowing — never before.
  if (CONVERTS_TRIAL.has(update.paymentStatus) && institute.trialEndsAt) {
    data.trialEndsAt = null;
  }

  // The plan the school actually paid for, resolved from the price the gateway
  // charged rather than from anything the browser claimed.
  const paidPlanId = await planIdForPrice(update.priceRef);
  if (paidPlanId && paidPlanId !== institute.planId) data.planId = paidPlanId;

  /**
   * The ordering checks above read a snapshot, and two webhooks for the same
   * institute can be in flight at once — gateways fan out deliveries in
   * parallel and retry while the first attempt is still running. A plain
   * `update` would let the slower request overwrite the faster one with older
   * data, silently undoing the guard.
   *
   * So the guards are repeated as WHERE conditions and the write goes through
   * `updateMany`: the database evaluates them at commit time, and a row count
   * of zero means a newer event won the race. This is what makes concurrent
   * delivery safe, not just sequential duplicates.
   */
  const guards = [
    { OR: [{ lastBillingEventAt: null }, { lastBillingEventAt: { lte: occurredAt } }] },
  ];
  if (data.currentPeriodEnd) {
    guards.push({
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lt: data.currentPeriodEnd } }],
    });
  }

  const { count } = await prisma.institute.updateMany({
    where: { id: institute.id, AND: guards },
    data,
  });

  if (count === 0) {
    return { applied: false, reason: "a newer event was applied concurrently", institute };
  }

  const updated = await prisma.institute.findUnique({ where: { id: institute.id } });

  // A paid invoice is also recorded in the existing ledger, so the super-admin
  // revenue views show gateway payments alongside bank transfers.
  if (update.invoice?.paid && update.invoice.period) {
    await prisma.subscriptionInvoice
      .upsert({
        where: {
          instituteId_period: { instituteId: institute.id, period: update.invoice.period },
        },
        update: { status: "PAID", paidAt: update.occurredAt ?? new Date() },
        create: {
          instituteId: institute.id,
          planId: institute.planId,
          period: update.invoice.period,
          amount: update.invoice.amount ?? 0,
          status: "PAID",
          paidAt: update.occurredAt ?? new Date(),
        },
      })
      .catch((err) => {
        // The ledger is a reporting convenience; failing to write it must not
        // make the gateway retry an event whose billing state already applied.
        console.error("[billing] could not record invoice:", err.message);
      });
  }

  return { applied: true, institute: updated };
}

/**
 * Records that an event has been handled.
 *
 * Returns false when the event was already recorded, which is the whole
 * idempotency mechanism: the unique index on (provider, eventId) makes the
 * second insert fail, and the caller treats that as "already done".
 */
export async function claimEvent({ provider, eventId, type, instituteId = null }) {
  try {
    await prisma.processedWebhookEvent.create({
      data: { provider, eventId, type, instituteId },
    });
    return true;
  } catch (err) {
    if (err.code === "P2002") return false; // duplicate delivery
    throw err;
  }
}

/**
 * Gives a claimed event back, so the gateway's retry can do the work.
 *
 * Only ever called when processing threw. A claim that outlives a failure turns
 * every retry into "already processed" and loses the payment for good — see the
 * comment at the call site in the webhook route.
 *
 * Deleting by the same unique key it was claimed with, so it cannot reach an
 * event some other delivery is legitimately holding.
 */
export async function releaseEvent({ provider, eventId }) {
  await prisma.processedWebhookEvent
    .delete({ where: { provider_eventId: { provider, eventId } } })
    .catch(() => {
      // Already gone, or never written. Either way there is nothing to release,
      // and failing here would replace the real error with a misleading one.
    });
}
