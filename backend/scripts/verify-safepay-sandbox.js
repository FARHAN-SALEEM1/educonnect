import "dotenv/config";

/**
 * Sandbox verification helper — a one-time payment, used only to make Safepay
 * send us a real webhook.
 *
 * Why this exists: Safepay's *subscription* checkout requires the payer to hold
 * a Safepay account, and their sandbox account signup is failing with
 * `recaptcha_token is required` — an external blocker on their side that we
 * will not work around. The one-time payment page supports guest checkout, so
 * it reaches the same webhook pipeline without that step.
 *
 * What it does NOT do: it is not part of the application, nothing imports it,
 * it defines no route, and it never touches the database or billing state. It
 * mints a Safepay tracker and prints a checkout URL. That is all.
 *
 * What the resulting webhook can and cannot prove is written up in
 * DEPLOYMENT.md — briefly: it settles the signature scheme, the envelope shape
 * and idempotency, and it proves nothing at all about subscription lifecycle,
 * trial conversion, period end or invoicing, because a one-time payment has
 * none of those.
 *
 *   node scripts/verify-safepay-sandbox.js
 */

const ENVIRONMENT = (process.env.SAFEPAY_ENVIRONMENT || "sandbox").toLowerCase();

const HOSTS = {
  sandbox: { api: "https://sandbox.api.getsafepay.com", checkout: "https://sandbox.api.getsafepay.com/checkout" },
  development: { api: "https://dev.api.getsafepay.com", checkout: "https://dev.api.getsafepay.com/checkout" },
};

/**
 * Live money has no business in a verification script, so production is not a
 * host this file knows how to reach.
 */
if (!HOSTS[ENVIRONMENT]) {
  console.error(
    `\n  SAFEPAY_ENVIRONMENT is "${ENVIRONMENT}". This script only runs against sandbox or development.\n`
  );
  process.exit(1);
}

const { api, checkout } = HOSTS[ENVIRONMENT];

/**
 * `client` is the PUBLIC key, not the merchant secret. They are different
 * credentials and Safepay answers "Client with this identifier not found" when
 * the secret is sent here, which is a confusing way to spend an afternoon.
 */
const publicKey = process.env.SAFEPAY_PUBLIC_KEY || "";
if (!publicKey) {
  console.error(
    `\n  SAFEPAY_PUBLIC_KEY is not set.\n` +
      `  It is the "Public key" from the Safepay sandbox dashboard — a public\n` +
      `  identifier, not a secret. Add it to backend/.env and run this again.\n`
  );
  process.exit(1);
}

const APP_URL = process.env.APP_URL || "http://localhost:5173";
const AMOUNT = Number(process.env.SAFEPAY_VERIFY_AMOUNT || 12999); // PKR, matches the Growth plan
const orderId = `verify-${Date.now()}`;

const main = async () => {
  console.log(`\n  Safepay sandbox verification — one-time payment\n`);
  console.log(`  environment : ${ENVIRONMENT}`);
  console.log(`  amount      : PKR ${AMOUNT}`);
  console.log(`  order id    : ${orderId}\n`);

  const res = await fetch(`${api}/order/v1/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: AMOUNT,
      client: publicKey,
      currency: "PKR",
      environment: ENVIRONMENT,
    }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body?.data?.token) {
    console.error(`  ✖ Could not create a tracker — HTTP ${res.status}`);
    console.error(`    ${JSON.stringify(body?.status ?? body).slice(0, 300)}\n`);
    process.exit(1);
  }

  const tracker = body.data.token;
  console.log(`  ✓ tracker created (${tracker.length} chars)\n`);

  /**
   * Parameters follow the official SDK's `checkout.create`. `webhooks=true` is
   * the one that matters here: without it Safepay completes the payment and
   * tells us nothing, which would defeat the entire exercise.
   */
  const params = new URLSearchParams({
    beacon: tracker,
    order_id: orderId,
    env: ENVIRONMENT,
    source: "custom",
    webhooks: "true",
    cancel_url: `${APP_URL}/billing/cancelled`,
    redirect_url: `${APP_URL}/billing/pending`,
  });

  console.log(`  Open this and complete it with a Safepay sandbox test card:\n`);
  console.log(`${checkout}/pay?${params.toString()}\n`);
  console.log(`  The redirect afterwards proves nothing and grants nothing —`);
  console.log(`  only the webhook does. Watch the capture file for the delivery.\n`);
};

main().catch((err) => {
  console.error(`\n  ✖ ${err.message}\n`);
  process.exit(1);
});
