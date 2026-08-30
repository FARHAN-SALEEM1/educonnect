/**
 * The Plan fields that are safe to send to a browser.
 *
 * Everything except `providerPriceIds`. Those are the gateway's own price
 * identifiers, and while they are not credentials — gateways expect them in
 * client-side checkout code, and ours grant nothing on their own, because the
 * server resolves the price from the plan and the webhook resolves the plan
 * from whatever was actually charged — there is no reason for them to leave
 * the server, so they don't.
 *
 * Use this wherever a plan is embedded in a response: `plan: { select: PLAN_PUBLIC }`
 * rather than `plan: true`. A bare `include: { plan: true }` sends every column,
 * which means adding a sensitive one to the model later would silently publish
 * it from a dozen endpoints at once.
 *
 * Server-side code that genuinely needs the price map — the checkout builder and
 * `planIdForPrice` in billing.service — queries Plan directly and is unaffected.
 */
export const PLAN_PUBLIC = {
  id: true,
  name: true,
  price: true,
  maxStudents: true,
  features: true,
  color: true,
  popular: true,
  isActive: true,
  createdAt: true,
};

/**
 * Institute columns that identify us to the payment gateway.
 *
 * These are references, not credentials — on their own they grant nothing, and
 * paid state still only moves on a signature-verified webhook. But they are our
 * side of the gateway relationship, the billing page has never needed them, and
 * `/billing/status` already curates its response down to what an admin actually
 * asks: am I paid up, and until when. Keeping them server-side everywhere makes
 * that one deliberate decision rather than one endpoint's good manners.
 */
export const INSTITUTE_PRIVATE_FIELDS = [
  "providerCustomerId",
  "providerSubscriptionId",
];

/**
 * Strips the gateway references from an institute record before it is returned.
 *
 * A deny-list rather than a select, deliberately: institutes are returned whole
 * from half a dozen endpoints and the portals read most columns, so an
 * allow-list would have to be maintained against the model and would break the
 * UI the first time it fell behind. The trade-off is that a *new* sensitive
 * column would not be hidden automatically — so add it to the list above when
 * one appears. `paymentProvider`, `paymentStatus` and `currentPeriodEnd` stay:
 * they are what the billing UI renders.
 *
 * Accepts a record, an array of them, or null, and never mutates its input.
 */
export const withoutProviderIds = (value) => {
  if (Array.isArray(value)) return value.map(withoutProviderIds);
  if (!value || typeof value !== "object") return value;

  const copy = { ...value };
  for (const field of INSTITUTE_PRIVATE_FIELDS) delete copy[field];
  return copy;
};
