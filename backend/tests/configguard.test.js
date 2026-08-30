import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Production must refuse to start on a configuration that would quietly
 * undermine the security work everywhere else.
 *
 * The interesting case here is CORS. `credentials: true` is set on the CORS
 * middleware because the refresh cookie has to travel to the API, and that
 * turns `CORS_ORIGIN=*` from a lazy convenience into an account-takeover
 * surface: any page on the internet could call the API as a signed-in user.
 * The go-live checklist has always said not to do it, which is exactly the
 * kind of instruction that gets skipped under deadline — so it is enforced.
 *
 * These run as separate processes because the guard's whole job is to call
 * process.exit(1) before the server ever listens.
 */

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..");

/** A production environment that is otherwise entirely valid. */
const SOUND = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  SMTP_HOST: "smtp.example.com",
  SMTP_FROM: "EduConnect <no-reply@example.com>",
  CORS_ORIGIN: "https://school.example.com",
  APP_URL: "https://school.example.com",
  /**
   * Pinned rather than inherited. The child process loads the developer's real
   * .env, and dotenv leaves any key already present in the environment alone —
   * so stating these here is what stops whatever a developer happens to be
   * debugging (a gateway mid-configuration, webhook capture left on) from
   * deciding whether this suite passes.
   */
  PAYMENT_PROVIDER: "manual",
  SAFEPAY_CAPTURE_WEBHOOKS: "",
  SAFEPAY_ENVIRONMENT: "sandbox",
  SAFEPAY_VERIFIED: "",
};

/**
 * Imports the config module under `overrides` and reports whether the process
 * survived it. Nothing else is loaded, so no database or port is touched.
 */
const boot = async (overrides = {}) => {
  try {
    const { stdout } = await run(
      process.execPath,
      ["-e", "import('./src/config/env.js').then(()=>console.log('STARTED'))"],
      { cwd: BACKEND, env: { ...process.env, ...SOUND, ...overrides } }
    );
    return { started: stdout.includes("STARTED"), output: stdout };
  } catch (err) {
    return { started: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

describe("production configuration guard", () => {
  it("starts when the configuration is sound", async () => {
    const { started } = await boot();
    expect(started).toBe(true);
  });

  it("refuses a wildcard CORS origin, which would expose credentialed requests", async () => {
    const { started, output } = await boot({ CORS_ORIGIN: "*" });
    expect(started).toBe(false);
    expect(output).toMatch(/CORS_ORIGIN/);
  });

  it("refuses a wildcard hidden among real origins", async () => {
    const { started } = await boot({ CORS_ORIGIN: "https://school.example.com,*" });
    expect(started).toBe(false);
  });

  it("refuses an unset CORS origin", async () => {
    const { started, output } = await boot({ CORS_ORIGIN: "" });
    expect(started).toBe(false);
    expect(output).toMatch(/CORS_ORIGIN/);
  });

  /**
   * The refresh cookie is Secure in production, so a plaintext origin means
   * sessions silently fail to persist — a bug that looks like a backend fault
   * and wastes a day to find.
   */
  it("refuses a plaintext http origin", async () => {
    const { started } = await boot({ CORS_ORIGIN: "http://school.example.com" });
    expect(started).toBe(false);
  });

  /**
   * `DEFAULT_USER_PASSWORD` was checked here too until 2026-08-30.
   *
   * It was removed because nothing read it: every account is created with
   * `EC-${crypto.randomBytes(4)}` (covered by onboarding.test.js), and the
   * README had already called the setting a legacy fallback. A guard that
   * blocks production over a value with no effect is worse than no guard —
   * it teaches whoever is deploying that these messages can be worked
   * around, and the next one will be real.
   */
  /**
   * Every link this product mails is built from APP_URL, so a production that
   * starts with the development default sends every school a link to their own
   * device. Found on 2026-08-30 the way it would be found in production: the
   * reset mail arrived, and the link died on the phone that opened it.
   */
  describe("APP_URL", () => {
    it("refuses to start without one", async () => {
      const { started, output } = await boot({ APP_URL: "" });
      expect(started).toBe(false);
      expect(output).toMatch(/APP_URL is not set/);
    });

    it("refuses one that points at the machine running it", async () => {
      for (const url of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
        const { started, output } = await boot({ APP_URL: url });
        expect(started, `${url} should be refused`).toBe(false);
        expect(output).toMatch(/points at your own machine/);
      }
    });

    it("refuses a plaintext one, because the reset token rides in it", async () => {
      const { started, output } = await boot({ APP_URL: "http://school.example.com" });
      expect(started).toBe(false);
      expect(output).toMatch(/travels in the clear/);
    });

    it("accepts a real https address", async () => {
      expect((await boot({ APP_URL: "https://app.school.edu.pk" })).started).toBe(true);
    });
  });

  it("still refuses placeholder secrets", async () => {
    expect((await boot({ JWT_ACCESS_SECRET: "change_me_access_secret" })).started).toBe(false);
  });

  it("still refuses to start without a way to send mail", async () => {
    expect((await boot({ SMTP_HOST: "" })).started).toBe(false);
    expect((await boot({ SMTP_FROM: "" })).started).toBe(false);
  });

  /**
   * A half-configured relay is worse than none: sends are deliberately caught
   * so a failed notification cannot fail the request, so the failure is silent
   * and nobody learns about it until a locked-out user calls for help.
   */
  it("refuses a relay with a username and no password, or the reverse", async () => {
    expect((await boot({ SMTP_USER: "apikey", SMTP_PASS: "" })).started).toBe(false);
    expect((await boot({ SMTP_USER: "", SMTP_PASS: "secret" })).started).toBe(false);
  });

  it("accepts a complete relay, credentials or not", async () => {
    expect((await boot({ SMTP_USER: "resend", SMTP_PASS: "re_xxx" })).started).toBe(true);
    expect((await boot({ SMTP_USER: "", SMTP_PASS: "" })).started).toBe(true);
  });

  it("refuses a From address that is not an address", async () => {
    const { started, output } = await boot({ SMTP_FROM: "EduConnect" });
    expect(started).toBe(false);
    expect(output).toMatch(/SMTP_FROM/);
  });

  it("accepts both bare and display-name From formats", async () => {
    expect((await boot({ SMTP_FROM: "no-reply@school.example.com" })).started).toBe(true);
    expect((await boot({ SMTP_FROM: "EduConnect <no-reply@school.example.com>" })).started).toBe(true);
  });

  /**
   * A gateway whose webhook secret is missing is worse than no gateway:
   * checkout would work and every confirmation would be unverifiable, so
   * schools would pay and be granted nothing.
   */
  it("refuses a payment gateway without its credentials", async () => {
    const { started } = await boot({ PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "" });
    expect(started).toBe(false);
  });

  it("allows the manual bank-transfer default with no gateway configuration", async () => {
    const { started } = await boot({ PAYMENT_PROVIDER: "manual" });
    expect(started).toBe(true);
  });

  /**
   * Raw webhook capture writes payer details and a valid gateway signature to a
   * plaintext file. It is a sandbox diagnostic for settling what Safepay's
   * signature actually covers, and the failure mode if it escapes is a file
   * quietly accumulating live payment data that nobody remembers enabling.
   */
  it("refuses to start in production while webhook capture is enabled", async () => {
    const { started, output } = await boot({ SAFEPAY_CAPTURE_WEBHOOKS: "/tmp/capture.jsonl" });
    expect(started).toBe(false);
    expect(output).toMatch(/SAFEPAY_CAPTURE_WEBHOOKS/);
  });

  it("starts normally when capture is unset", async () => {
    expect((await boot({ SAFEPAY_CAPTURE_WEBHOOKS: "" })).started).toBe(true);
  });
});
