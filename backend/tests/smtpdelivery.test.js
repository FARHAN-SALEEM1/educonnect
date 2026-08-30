import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSmtpSink } from "./helpers/smtp-sink.js";

const run = promisify(execFile);
const BACKEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Mail that actually goes down a socket.
 *
 * Everything about email was tested from one side or the other: `email.test.js`
 * covers SMTP being absent (console fallback) and SMTP being present but every
 * send failing. Neither state ever transmits a message, so nothing had checked
 * the case the feature exists for — that nodemailer connects, offers its
 * credentials, and puts the right envelope, subject and words on the wire.
 *
 * `helpers/smtp-sink.js` is a real SMTP server, so these are real sends. What
 * they do not prove is delivery through somebody else's relay into a real
 * inbox: no SPF, no DKIM, no spam filter, no third party. That needs real
 * credentials, which this project does not have.
 *
 * The transport is built once at module load from the environment, so each
 * case runs in its own process with SMTP pointed at the sink.
 */

/** Runs a snippet against the real email service with SMTP aimed at `port`. */
const withSmtp = async (port, script, extraEnv = {}) => {
  const { stdout } = await run(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      cwd: BACKEND,
      env: {
        ...process.env,
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(port),
        SMTP_FROM: "EduConnect <no-reply@test.edu>",
        // The sink speaks plain SMTP with no STARTTLS, and these cases send
        // credentials — which the transport now refuses to do over an
        // unencrypted link. Opting out here is the point of the escape hatch;
        // the default is pinned by its own test below.
        SMTP_REQUIRE_TLS: "false",
        ...extraEnv,
      },
      timeout: 60000,
    }
  );
  const marker = stdout.indexOf("RESULT");
  if (marker === -1) throw new Error(`no RESULT in output:\n${stdout}`);
  return JSON.parse(stdout.slice(marker + 6).split("\n")[0]);
};

/** Every template, driven directly, with values a school would recognise. */
const SEND_ALL = `
  const m = await import("./src/services/email.service.js");
  const out = {};
  out.enabled = m.emailEnabled();
  out.reset = await m.sendPasswordReset({
    to: "head@school.test", name: "Imran Sheikh",
    resetUrl: "https://educonnect.test/reset?token=SECRET-TOKEN-VALUE",
    expiresMinutes: 30,
  });
  out.welcome = await m.sendWelcome({
    to: "teacher@school.test", name: "Hassan Raza", role: "teacher",
    instituteName: "Beaconhouse Karachi", tempPassword: "EC-9f2a71bc",
    loginUrl: "https://educonnect.test/",
  });
  out.absence = await m.sendAbsenceAlert({
    to: "guardian@school.test", name: "Sara Ahmed",
    instituteName: "Beaconhouse Karachi", date: "Friday, 28 August 2026",
    students: [{ name: "Zain Ahmed", grade: "Grade 9", section: "A" }],
  });
  out.fee = await m.sendFeeReminder({
    to: "guardian@school.test", name: "Sara Ahmed",
    instituteName: "Beaconhouse Karachi", total: 12500,
    items: [{ student: "Zain Ahmed", title: "Nov 2026", amount: 12500, status: "OVERDUE" }],
  });
  out.changed = await m.sendPasswordChanged({ to: "head@school.test", name: "Imran Sheikh" });
  console.log("RESULT" + JSON.stringify(out));
  process.exit(0);
`;

describe("a real SMTP conversation", () => {
  let sink;
  let result;
  let byRecipient;

  beforeAll(async () => {
    sink = await startSmtpSink();
    result = await withSmtp(sink.port, SEND_ALL, {
      SMTP_USER: "relay-user",
      SMTP_PASS: "relay-password-must-not-appear",
    });
    await sink.waitFor(5);
    byRecipient = (subjectFragment) =>
      sink.messages.find((m) => m.subject.includes(subjectFragment));
  }, 90000);

  afterAll(async () => {
    await sink?.close();
  });

  it("reports SMTP as configured once a host is set", () => {
    expect(result.enabled).toBe(true);
  });

  it("delivers every one of the five messages", () => {
    expect(sink.messages).toHaveLength(5);
    for (const key of ["reset", "welcome", "absence", "fee", "changed"]) {
      expect(result[key].delivered, `${key} was not delivered`).toBe(true);
      expect(result[key].messageId, `${key} has no message id`).toBeTruthy();
    }
  });

  it("offers the configured credentials to the relay", () => {
    expect(sink.authAttempts.length).toBeGreaterThan(0);
  });

  it("sends from the configured address", () => {
    for (const m of sink.messages) {
      expect(m.envelopeFrom).toBe("no-reply@test.edu");
      expect(m.from).toContain("no-reply@test.edu");
    }
  });

  /**
   * The envelope is what a relay routes on. A message whose headers say one
   * guardian and whose envelope says another is delivered to the envelope.
   */
  it("addresses each message to the right person, in the envelope and the header", () => {
    expect(byRecipient("Reset your").envelopeTo).toEqual(["head@school.test"]);
    expect(byRecipient("Your EduConnect account").envelopeTo).toEqual(["teacher@school.test"]);
    expect(byRecipient("Absence on").envelopeTo).toEqual(["guardian@school.test"]);
    expect(byRecipient("Fee reminder").envelopeTo).toEqual(["guardian@school.test"]);
    for (const m of sink.messages) expect(m.to).toBe(m.envelopeTo[0]);
  });

  describe("what each message actually says", () => {
    it("the reset carries the working link", () => {
      const m = byRecipient("Reset your");
      expect(m.subject).toBe("Reset your EduConnect password");
      expect(m.body).toContain("https://educonnect.test/reset?token=SECRET-TOKEN-VALUE");
      expect(m.body).toContain("30 minutes");
    });

    it("the welcome carries the address and the temporary password", () => {
      const m = byRecipient("Your EduConnect account");
      expect(m.subject).toContain("Beaconhouse Karachi");
      expect(m.body).toContain("teacher@school.test");
      expect(m.body).toContain("EC-9f2a71bc");
    });

    it("the absence names the child, the class and the day", () => {
      const m = byRecipient("Absence on");
      expect(m.subject).toContain("Friday, 28 August 2026");
      expect(m.body).toContain("Zain Ahmed");
      expect(m.body).toContain("Grade 9");
      // Asks rather than accuses — a wrongly marked register is a real thing.
      expect(m.body.toLowerCase()).toContain("if the school already knows the reason");
    });

    it("the fee reminder carries the figure a parent would query", () => {
      const m = byRecipient("Fee reminder");
      expect(m.subject).toContain("12,500");
      expect(m.body).toContain("Nov 2026");
      expect(m.body).toContain("12,500");
    });

    it("the password-change warning tells them what to do", () => {
      const m = byRecipient("password was changed");
      expect(m.body.toLowerCase()).toContain("contact your school administrator");
    });
  });

  /**
   * The relay password is handed to the server during AUTH, base64 encoded per
   * the protocol. What must never happen is it turning up in a message body,
   * where it would sit in somebody's inbox.
   */
  it("never puts the relay password in a message", () => {
    for (const m of sink.messages) {
      expect(m.raw).not.toContain("relay-password-must-not-appear");
      expect(m.body).not.toContain("relay-password-must-not-appear");
    }
  });
});

/**
 * A notification that fails must not take the operation with it. These drive
 * the service directly; the API-level halves of the same contract are pinned in
 * email.test.js, absencealerts.test.js and onboarding.test.js.
 */
describe("when the relay misbehaves", () => {
  it("reports a refused connection instead of throwing", async () => {
    // Port 1 refuses immediately, so this fails fast and reaches no real host.
    const out = await withSmtp(1, `
      const m = await import("./src/services/email.service.js");
      const r = await m.sendPasswordChanged({ to: "x@school.test", name: "X" });
      console.log("RESULT" + JSON.stringify({ ...r, threw: false }));
      process.exit(0);
    `);
    expect(out.delivered).toBe(false);
    expect(out.reason).toBeTruthy();
    expect(out.threw).toBe(false);
  }, 90000);

  it("reports a relay that accepts the session and then rejects the message", async () => {
    const sink = await startSmtpSink({ failAt: "DATA" });
    try {
      const out = await withSmtp(sink.port, `
        const m = await import("./src/services/email.service.js");
        const r = await m.sendFeeReminder({
          to: "guardian@school.test", name: "Sara", instituteName: "S",
          total: 100, items: [{ student: "Z", title: "Nov", amount: 100, status: "PENDING" }],
        });
        console.log("RESULT" + JSON.stringify({ ...r, threw: false }));
        process.exit(0);
      `);
      expect(out.delivered).toBe(false);
      expect(out.reason).toBeTruthy();
      expect(sink.messages).toHaveLength(0);
    } finally {
      await sink.close();
    }
  }, 90000);

  /**
   * Half-configured is the state the environment check warns about: a relay
   * that will reject every send, silently, because failures are swallowed.
   */
  it("still refuses to pretend when authentication is demanded and not offered", async () => {
    const sink = await startSmtpSink({ requireAuth: true });
    try {
      const out = await withSmtp(sink.port, `
        const m = await import("./src/services/email.service.js");
        const r = await m.sendPasswordChanged({ to: "x@school.test", name: "X" });
        console.log("RESULT" + JSON.stringify(r));
        process.exit(0);
      `);
      // No SMTP_USER is set here, so nodemailer offers nothing and the relay
      // rejects at MAIL FROM.
      expect(out.delivered).toBe(false);
      expect(sink.messages).toHaveLength(0);
    } finally {
      await sink.close();
    }
  }, 90000);
});

/**
 * Credentials do not go out over an unencrypted link.
 *
 * On 587 nodemailer upgrades with STARTTLS only if the relay offers it. A
 * relay that does not — or a network position that strips the offer — used to
 * get the username and password in plain text, and the send still succeeded,
 * so nothing anywhere would have said so.
 */
describe("transport security", () => {
  it("refuses to authenticate against a relay with no STARTTLS", async () => {
    const sink = await startSmtpSink();
    try {
      const out = await withSmtp(sink.port, `
        const m = await import("./src/services/email.service.js");
        const r = await m.sendPasswordChanged({ to: "x@school.test", name: "X" });
        console.log("RESULT" + JSON.stringify(r));
        process.exit(0);
      `, {
        SMTP_USER: "relay-user",
        SMTP_PASS: "relay-password-must-not-appear",
        // Deliberately not opting out: this is the default being tested.
        SMTP_REQUIRE_TLS: "",
      });

      expect(out.delivered).toBe(false);
      expect(sink.messages).toHaveLength(0);
      // And the password never reached the socket in any form.
      expect(JSON.stringify(sink.authAttempts)).not.toContain("relay-password");
    } finally {
      await sink.close();
    }
  }, 90000);

  /**
   * A relay with no credentials has nothing to protect, so demanding TLS
   * there would only break local and internal setups for no gain.
   */
  it("still sends unauthenticated mail over a plain connection", async () => {
    const sink = await startSmtpSink();
    try {
      const out = await withSmtp(sink.port, `
        const m = await import("./src/services/email.service.js");
        const r = await m.sendPasswordChanged({ to: "x@school.test", name: "X" });
        console.log("RESULT" + JSON.stringify(r));
        process.exit(0);
      `, { SMTP_USER: "", SMTP_PASS: "", SMTP_REQUIRE_TLS: "" });

      expect(out.delivered).toBe(true);
      await sink.waitFor(1);
      expect(sink.messages).toHaveLength(1);
    } finally {
      await sink.close();
    }
  }, 90000);
});
