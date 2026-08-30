import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(
    `\n[config] Missing required environment variables: ${missing.join(", ")}\n` +
      `Copy .env.example to .env and fill them in.\n`
  );
  process.exit(1);
}

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Refuse to start production with the placeholder secrets from .env.example.
 * Shipping those would let anyone mint a valid token for any account, and it
 * is exactly the kind of thing that survives a rushed deploy unnoticed.
 */
if (process.env.NODE_ENV === "production") {
  const weak = [];

  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
    const value = process.env[key] || "";
    if (value.startsWith("change_me") || value.length < 32) weak.push(key);
  }

  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    weak.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  }


  /**
   * CORS is sent with `credentials: true`, so a wildcard origin is not the
   * mild convenience it looks like: it lets any website on the internet make
   * authenticated calls carrying a signed-in user's refresh cookie. The
   * go-live checklist has always said not to do this; that is worth enforcing
   * rather than trusting.
   */
  const origins = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origins.length) {
    weak.push("CORS_ORIGIN is not set — set it to your frontend's exact origin");
  } else if (origins.includes("*")) {
    weak.push("CORS_ORIGIN is '*' — with credentialed requests this allows any site to call the API as a signed-in user");
  } else if (origins.some((o) => o.startsWith("http://"))) {
    weak.push("CORS_ORIGIN contains a plaintext http:// origin — the refresh cookie is Secure and will not be sent");
  }

  /**
   * Every link this product mails out is built from APP_URL.
   *
   * It is used six times — the password-reset link, the two billing return
   * URLs, and the login link in the welcome email sent to a new institute,
   * parent, teacher and user. Left at its development default, production
   * starts perfectly happily and then sends every school a link to
   * `localhost`, which resolves to whatever device opened the message. The
   * head teacher taps it on a phone and gets "webpage cannot be reached";
   * nothing in the logs says anything is wrong.
   *
   * Plaintext is refused for the same reason as the CORS origin, only
   * sharper: a reset token in an http:// link travels in the clear, and
   * that token is a password change.
   */
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    weak.push("APP_URL is not set — every emailed link would point at http://localhost:5173");
  } else if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(appUrl)) {
    weak.push(`APP_URL points at your own machine (${appUrl}) — reset and login links would be unopenable for everyone else`);
  } else if (appUrl.startsWith("http://")) {
    weak.push(`APP_URL is plaintext (${appUrl}) — a password-reset token in an http:// link travels in the clear`);
  }

  /**
   * Without SMTP the mail service falls back to writing messages to the
   * console. That is fine locally and useless in production: a password reset
   * link that only appears in the server log means nobody can ever reset a
   * password, and the link itself ends up in log aggregation.
   */
  if (!process.env.SMTP_HOST) {
    weak.push("SMTP_HOST is not set — password resets and fee reminders cannot be delivered");
  } else if (!process.env.SMTP_FROM) {
    weak.push("SMTP_FROM is not set — outgoing mail needs a From address");
  } else {
    /**
     * A half-configured mailer is the worst outcome of the three, because it
     * fails silently: sends are caught so a failed notification can't fail the
     * request, so nobody finds out until a locked-out head teacher calls. Both
     * of these are rejected at the relay, not by us.
     */
    if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS)) {
      weak.push("SMTP_USER and SMTP_PASS must be set together — a half-configured relay fails every send silently");
    }
    if (!/@/.test(process.env.SMTP_FROM)) {
      weak.push(`SMTP_FROM is not an email address (${process.env.SMTP_FROM}) — relays will reject every message`);
    }
  }

  /**
   * A gateway without its webhook secret is worse than no gateway: checkout
   * would work, money would move, and every confirmation would be rejected as
   * unverifiable — so schools would pay and not be granted access.
   */
  const gateway = String(process.env.PAYMENT_PROVIDER || "manual").toUpperCase();
  if (gateway === "STRIPE") {
    if (!process.env.STRIPE_SECRET_KEY) weak.push("PAYMENT_PROVIDER=stripe but STRIPE_SECRET_KEY is not set");
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      weak.push("PAYMENT_PROVIDER=stripe but STRIPE_WEBHOOK_SECRET is not set — payments could never be confirmed");
    }
  }
  if (gateway === "SAFEPAY") {
    if (!process.env.SAFEPAY_API_KEY) weak.push("PAYMENT_PROVIDER=safepay but SAFEPAY_API_KEY is not set");
    if (!process.env.SAFEPAY_WEBHOOK_SECRET) {
      weak.push("PAYMENT_PROVIDER=safepay but SAFEPAY_WEBHOOK_SECRET is not set — payments could never be confirmed");
    }
    /**
     * The Safepay adapter has never handled real traffic. Reaching production
     * on it would mean taking money through a code path nobody has watched
     * work, so it has to be opted into deliberately rather than by leaving
     * SAFEPAY_ENVIRONMENT unset.
     */
    if (String(process.env.SAFEPAY_ENVIRONMENT || "sandbox").toLowerCase() === "production"
        && process.env.SAFEPAY_VERIFIED !== "true") {
      weak.push(
        "SAFEPAY_ENVIRONMENT=production but the adapter has not been verified against Safepay traffic — " +
          "run the sandbox checks first, then set SAFEPAY_VERIFIED=true to acknowledge"
      );
    }
  }

  /**
   * Webhook capture writes payer details and a valid signature to a plaintext
   * file. It is a sandbox diagnostic and has no business anywhere near live
   * traffic, so production refuses to start with it set rather than quietly
   * accumulating a file nobody remembers is there.
   */
  if (process.env.SAFEPAY_CAPTURE_WEBHOOKS) {
    weak.push("SAFEPAY_CAPTURE_WEBHOOKS is set — raw webhook capture is a sandbox diagnostic and must be unset in production");
  }

  if (weak.length) {
    console.error(
      `\n[config] Refusing to start in production with insecure settings:\n` +
        weak.map((w) => `  - ${w}`).join("\n") +
        `\n\nGenerate secrets with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"\n`
    );
    process.exit(1);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: num(process.env.PORT, 5000),

  databaseUrl: process.env.DATABASE_URL,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  },

  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 10),

  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Rate limits.
   *
   * A school reaches the API from one public address, so anything keyed on IP
   * is really keyed on "everybody at that school at once". The per-IP budgets
   * are therefore generous and only the precise, per-identity limits are
   * tight — see middleware/rateLimit.js for how the two layers divide the work.
   */
  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    /** Every API request, per IP. A page view is roughly eight calls. */
    max: num(process.env.RATE_LIMIT_MAX, 2000),
    /** Failed auth attempts per IP. Successes never count toward it. */
    authMax: num(process.env.AUTH_RATE_LIMIT_MAX, 50),
    /** Failed attempts against a single email address, wherever they come from. */
    accountMax: num(process.env.ACCOUNT_RATE_LIMIT_MAX, 10),
    /** Rejected refreshes per IP — a valid session's refreshes don't count. */
    refreshMax: num(process.env.REFRESH_RATE_LIMIT_MAX, 60),
    /** Wrong current-password attempts, per signed-in user. */
    passwordChangeMax: num(process.env.PASSWORD_CHANGE_RATE_LIMIT_MAX, 10),
    /**
     * Webhook deliveries that FAIL verification, per IP. Generous, because a
     * genuine delivery never counts and a gateway changing its signing key
     * mid-flight should trip an alarm rather than a hard block.
     */
    webhookMax: num(process.env.WEBHOOK_RATE_LIMIT_MAX, 100),
  },


  smtp: {
    host: process.env.SMTP_HOST || "",
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "EduConnect <no-reply@educonnect.io>",
    /**
     * Whether STARTTLS is demanded on a non-465 port. Unset means "yes when
     * credentials are configured", which is the only sensible default: a
     * password that upgrades opportunistically is a password that can be read.
     */
    requireTls:
      process.env.SMTP_REQUIRE_TLS === undefined || process.env.SMTP_REQUIRE_TLS === ""
        ? undefined
        : process.env.SMTP_REQUIRE_TLS !== "false",
  },

  /**
   * Billing.
   *
   * `manual` means bank transfer recorded by a super admin — the default, and
   * what every existing institute uses. A real gateway is opt-in, and its
   * secrets live only here on the server; nothing payment-related is ever
   * exposed to the browser, because checkout is a redirect to the gateway's
   * own hosted page.
   */
  payments: {
    provider: process.env.PAYMENT_PROVIDER || "manual",
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || "",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    },
    /**
     * Sandbox diagnostics only: a file path to append raw webhook deliveries to,
     * before verification, so the exact signed bytes can be studied.
     *
     * Safepay's documentation and their own SDK disagree about what the
     * signature covers — the docs say the raw body, the SDK signs
     * `JSON.stringify(body.data)` — and that cannot be settled from either
     * source, only from a real delivery. Capturing happens alongside
     * verification and changes none of it: an unverified event is still
     * rejected and still touches nothing.
     *
     * Unset by default, and refused outright in production (see the guard
     * above): captured payloads contain payer details and a valid signature.
     */
    captureWebhooksTo: process.env.SAFEPAY_CAPTURE_WEBHOOKS || "",
    safepay: {
      apiKey: process.env.SAFEPAY_API_KEY || "",
      publicKey: process.env.SAFEPAY_PUBLIC_KEY || "",
      webhookSecret: process.env.SAFEPAY_WEBHOOK_SECRET || "",
      // Sandbox unless explicitly told otherwise — an install that forgets to
      // set this must not reach live money.
      environment: process.env.SAFEPAY_ENVIRONMENT || "sandbox",
    },
  },

  /** Where password-reset links point. */
  appUrl: (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  passwordResetExpiryMinutes: num(process.env.PASSWORD_RESET_EXPIRY_MINUTES, 30),

  /**
   * Refresh-token cookie.
   *
   * `sameSite: "none"` is required when the API and frontend sit on different
   * domains (Render + Vercel), and browsers only accept it alongside `secure`,
   * so it forces HTTPS. Same-origin or proxied setups keep the stricter "lax".
   */
  cookie: {
    name: "educonnect_rt",
    crossSite: process.env.COOKIE_CROSS_SITE === "true",
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
};
