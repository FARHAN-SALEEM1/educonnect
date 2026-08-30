/**
 * Proves that this installation can actually deliver email.
 *
 *   npm run smtp:verify -- someone@example.com
 *
 * Production refuses to start without SMTP (see src/config/env.js), and the
 * reason is password reset: without a working relay a locked-out head teacher
 * has no way back in, and the reset link only ever reaches the server log.
 * So this sends a **real password-reset message through the real code path** —
 * `sendPasswordReset`, the same function the reset route calls, with the same
 * template and the same transport — rather than a parallel "test" send that
 * could pass while the real one fails.
 *
 * Three questions, asked separately, because they fail for different reasons
 * and a single "it did not arrive" hides which:
 *
 *   1. Is the configuration complete?      (nothing sent yet)
 *   2. Can we reach the relay and sign in? (transport.verify)
 *   3. Does the relay accept a message?    (a real send)
 *
 * And a fourth this script cannot answer: **did it land in the inbox?** A relay
 * accepting a message is not delivery — it can still be filtered, bounced, or
 * dropped later. Only you can confirm that, so the script asks you to.
 *
 * The password is never printed, and never leaves .env.
 */
import "dotenv/config";
import { emailEnabled, sendPasswordReset, verifyConnection } from "../src/services/email.service.js";

const to = process.argv[2];

const line = (s = "") => console.log(s);
const ok = (s) => console.log(`  ✓ ${s}`);
const bad = (s) => console.log(`  ✗ ${s}`);

/** Shows a value's shape without showing the value. */
const shape = (v) => (v ? `set (${String(v).length} chars)` : "not set");

if (!to || !to.includes("@")) {
  line();
  line("Usage:  npm run smtp:verify -- you@example.com");
  line();
  line("Send it to an inbox you can actually open — the last check is you");
  line("confirming the message arrived.");
  line();
  process.exit(1);
}

line();
line("EduConnect — SMTP verification");
line("=".repeat(48));

// ── 1 · configuration ────────────────────────────────────────────────────
line();
line("1. Configuration");
const host = process.env.SMTP_HOST;
const from = process.env.SMTP_FROM;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

line(`     SMTP_HOST  ${host || "not set"}`);
line(`     SMTP_PORT  ${process.env.SMTP_PORT || "587 (default)"}`);
line(`     SMTP_USER  ${user || "not set"}`);
line(`     SMTP_PASS  ${shape(pass)}`);
line(`     SMTP_FROM  ${from || "not set"}`);
line(`     REQUIRE_TLS ${process.env.SMTP_REQUIRE_TLS || "(blank — required whenever SMTP_USER is set)"}`);
line();

const problems = [];
if (!host) problems.push("SMTP_HOST is empty — nothing can be sent, and production will refuse to start");
if (!from) problems.push("SMTP_FROM is empty — outgoing mail needs a From address");
if (from && !from.includes("@")) problems.push(`SMTP_FROM has no @ in it (${from}) — relays reject that`);
if (Boolean(user) !== Boolean(pass)) {
  problems.push("SMTP_USER and SMTP_PASS must be set together — half-configured means every send fails silently");
}

if (problems.length) {
  for (const p of problems) bad(p);
  line();
  line("  Fill these in backend/.env, then run this again.");
  line();
  process.exit(1);
}
ok("complete");

if (!emailEnabled()) {
  line();
  bad("The mail service still started in console mode.");
  line("  That means .env was not picked up — check you edited backend/.env.");
  line();
  process.exit(1);
}

// ── 2 · connection and sign-in ───────────────────────────────────────────
line();
line("2. Connection and sign-in");
const conn = await verifyConnection();
if (!conn.ok) {
  bad(conn.reason);
  line();
  line("  Common causes:");
  line("    · Gmail — you used the account password. It needs an App Password.");
  line("    · Wrong port. 465 is TLS from the first byte; 587 upgrades with STARTTLS.");
  line("    · The relay is unreachable from this network.");
  line();
  process.exit(1);
}
ok("reached the relay and signed in");

// ── 3 · a real send, through the real function ───────────────────────────
line();
line("3. Sending a real password-reset email");
line(`     to: ${to}`);

const result = await sendPasswordReset({
  to,
  name: "SMTP Verification",
  // Deliberately not a working token: this proves delivery, and a live reset
  // link sitting in a mailbox is exactly what the production guard exists to
  // prevent.
  resetUrl: "https://example.invalid/reset?this-is-a-delivery-test",
  expiresMinutes: 30,
});

line();
if (!result.delivered) {
  bad(`the relay did not accept it: ${result.reason}`);
  line();
  line("  The connection worked, so this is about the message rather than the");
  line("  login — usually the From address. Many relays only accept a From on a");
  line("  domain you have verified with them.");
  line();
  process.exit(1);
}
ok(`accepted by the relay — message id ${result.messageId}`);

// ── 4 · the part only you can confirm ────────────────────────────────────
line();
line("=".repeat(48));
line();
line("The relay took the message. That is as far as this script can see.");
line();
line("  Now open " + to + " and confirm it arrived —");
line("  subject: \"Reset your EduConnect password\"");
line();
line("  Check spam too. If it is there, delivery works but reputation does");
line("  not, and a school's parents would meet the same folder.");
line();
line("Until you have seen it in an inbox, email is verified as ACCEPTED,");
line("not as DELIVERED.");
line();
