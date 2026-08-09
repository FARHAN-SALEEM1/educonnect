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

  if (process.env.DEFAULT_USER_PASSWORD === "educonnect123") {
    weak.push("DEFAULT_USER_PASSWORD is still the documented default");
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

  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    max: num(process.env.RATE_LIMIT_MAX, 500),
    authMax: num(process.env.AUTH_RATE_LIMIT_MAX, 20),
  },

  defaultUserPassword: process.env.DEFAULT_USER_PASSWORD || "educonnect123",

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "EduConnect <no-reply@educonnect.io>",
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
