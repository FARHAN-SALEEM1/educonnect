import nodemailer from "nodemailer";
import { env } from "../config/env.js";

/**
 * Outbound email.
 *
 * With SMTP configured, mail is sent. Without it, messages are logged to the
 * console instead — so development and demos work with zero setup, and a
 * missing SMTP host can never take down a request that merely wanted to
 * notify someone.
 */

let transport = null;

if (env.smtp.host) {
  /**
   * Port 465 is TLS from the first byte. Everything else — 587, 25 — starts in
   * plain text and upgrades with STARTTLS.
   *
   * `requireTLS` matters whenever a username and password are configured.
   * Without it nodemailer upgrades only if the relay offers STARTTLS, so a
   * relay that does not advertise it (or a network position that strips the
   * advertisement) gets the credentials over an unencrypted connection and the
   * send still succeeds — nothing anywhere would say it had happened. Verified
   * against a local relay that advertises no STARTTLS: the AUTH went out.
   *
   * Every provider this project documents supports STARTTLS on 587, so
   * demanding it costs nothing real. `SMTP_REQUIRE_TLS=false` is the way out
   * for a relay on a trusted network that genuinely cannot do TLS — and for
   * the test suite's own local sink.
   */
  const implicitTls = env.smtp.port === 465;
  const requireTls = env.smtp.requireTls ?? Boolean(env.smtp.user);

  transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: implicitTls,
    requireTLS: !implicitTls && requireTls,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });

  console.log(
    `[email] SMTP configured: ${env.smtp.host}:${env.smtp.port}` +
      ` (${implicitTls ? "implicit TLS" : requireTls ? "STARTTLS required" : "STARTTLS optional"})`
  );
} else {
  console.log("[email] No SMTP configured — emails will be written to the console");
}

export const emailEnabled = () => Boolean(transport);

/**
 * Can we reach the relay and sign in to it?
 *
 * Separate from sending on purpose. `send` swallows every failure so a
 * notification can never fail the operation that triggered it, which means a
 * wrong password and a rejected recipient look identical from the outside.
 * This asks the narrower question first, so `npm run smtp:verify` can say
 * which of the two went wrong instead of just "it did not arrive".
 *
 * Never throws, and never returns the credential.
 */
export const verifyConnection = async () => {
  if (!transport) return { ok: false, reason: "smtp-not-configured" };
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
};

/**
 * Plain-English reason a message did not arrive, for the caller to put in
 * front of whoever is looking at the screen.
 *
 * Every send here is deliberately swallowed so a failed notification cannot
 * fail the operation that triggered it. The cost of that is a caller who
 * cannot tell "sent" from "silently dropped" unless it looks — and an account
 * created with a generated password is unreachable the moment nobody is told
 * what the password was. So when mail does not land, the caller shows the
 * credentials instead, and says why it is showing them.
 */
export const undeliveredReason = (reason) => {
  if (reason === "smtp-not-configured") return "no mail server configured";
  if (reason === "welcome-emails-off") return "welcome emails are turned off for this institute";
  return "the email could not be delivered";
};

/** A non-send, shaped like a send result so callers can treat them alike. */
export const notSent = (reason) => ({ delivered: false, reason });

/**
 * Escapes a value for HTML.
 *
 * Names, institute names and invoice titles are free text — nothing validates
 * them beyond a length — and they land in the HTML body of a message that goes
 * to a parent. Without this, an admin could put a link or an image in a student
 * name and have it render inside every guardian's fee reminder. Same tenant,
 * so not a privilege boundary, but it is still someone else's inbox.
 *
 * The plain-text alternative of each message needs no escaping.
 */
export const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const shell = (title, body) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F8FAFC;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #E2E8F0">
    <div style="font-size:20px;font-weight:800;color:#1B4332;margin-bottom:4px">✦ EduConnect</div>
    <h1 style="font-size:18px;color:#0F172A;margin:16px 0 12px">${title}</h1>
    ${body}
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0"/>
    <p style="font-size:12px;color:#64748B;margin:0">
      This is an automated message from EduConnect. If you weren't expecting it, you can ignore it.
    </p>
  </div>
</div>`;

/** Never throws — a failed notification must not fail the operation. */
async function send({ to, subject, html, text }) {
  if (!transport) {
    console.log(
      `\n[email] (not sent — no SMTP)\n  to: ${to}\n  subject: ${subject}\n  ${text?.replace(/\n/g, "\n  ") ?? ""}\n`
    );
    return { delivered: false, reason: "smtp-not-configured" };
  }

  try {
    const info = await transport.sendMail({ from: env.smtp.from, to, subject, html, text });
    return { delivered: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] failed to send "${subject}" to ${to}:`, err.message);
    return { delivered: false, reason: err.message };
  }
}

export const sendPasswordReset = ({ to, name, resetUrl, expiresMinutes }) =>
  send({
    to,
    subject: "Reset your EduConnect password",
    text:
      `Hi ${name},\n\nUse this link to set a new password (valid for ${expiresMinutes} minutes):\n` +
      `${resetUrl}\n\nIf you didn't request this, ignore this email — your password won't change.`,
    html: shell(
      "Reset your password",
      `<p style="font-size:14px;color:#334155;line-height:1.7">Hi ${esc(name)}, use the button below to set a new password. The link is valid for <b>${expiresMinutes} minutes</b> and can be used once.</p>
       <p style="margin:24px 0"><a href="${esc(resetUrl)}" style="background:#1B4332;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block">Set a new password</a></p>
       <p style="font-size:12px;color:#64748B;line-height:1.7">If the button doesn't work, paste this into your browser:<br/><span style="word-break:break-all;color:#2D6A4F">${esc(resetUrl)}</span></p>
       <p style="font-size:13px;color:#334155">If you didn't request this, ignore this email — your password won't change.</p>`
    ),
  });

export const sendWelcome = ({ to, name, role, instituteName, tempPassword, loginUrl }) =>
  send({
    to,
    subject: `Your EduConnect account for ${instituteName}`,
    text:
      `Hi ${name},\n\nAn account has been created for you at ${instituteName} as ${role}.\n\n` +
      `Sign in: ${loginUrl}\nEmail: ${to}\nTemporary password: ${tempPassword}\n\n` +
      `Please change your password after signing in.`,
    html: shell(
      `Your account at ${esc(instituteName)}`,
      `<p style="font-size:14px;color:#334155;line-height:1.7">Hi ${esc(name)}, an account has been created for you as <b>${esc(role)}</b>.</p>
       <table style="font-size:14px;color:#334155;margin:16px 0">
         <tr><td style="padding:4px 16px 4px 0;color:#64748B">Email</td><td><b>${esc(to)}</b></td></tr>
         <tr><td style="padding:4px 16px 4px 0;color:#64748B">Temporary password</td><td><b>${esc(tempPassword)}</b></td></tr>
       </table>
       <p style="margin:24px 0"><a href="${esc(loginUrl)}" style="background:#1B4332;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block">Sign in</a></p>
       <p style="font-size:13px;color:#334155">Please change your password once you're in.</p>`
    ),
  });

/**
 * Same-day word that a child was not in class.
 *
 * The value of this is entirely in when it arrives: a guardian who hears at
 * 9 a.m. can act, one who finds out at the end of the month cannot. So the text
 * leads with the date and the child, says plainly that the school may already
 * know the reason, and asks rather than accuses — a wrongly marked register is
 * a real possibility and an accusing message would land badly.
 */
export const sendAbsenceAlert = ({ to, name, instituteName, date, students }) => {
  const lines = students.map((s) => `• ${s.name} — ${s.grade} ${s.section}`).join("\n");
  const many = students.length > 1;

  return send({
    to,
    subject: `Absence on ${date} — ${instituteName}`,
    text:
      `Dear ${name},\n\nThe following ${many ? "children were" : "child was"} marked absent at ` +
      `${instituteName} on ${date}:\n\n${lines}\n\n` +
      `If the school already knows the reason, please ignore this message. Otherwise ` +
      `kindly inform the class teacher or the school office.`,
    html: shell(
      `Absence on ${esc(date)}`,
      `<p style="font-size:14px;color:#334155;line-height:1.7">Dear ${esc(name)}, the following ${many ? "children were" : "child was"} marked absent at <b>${esc(instituteName)}</b> on <b>${esc(date)}</b>:</p>
       <table style="font-size:14px;color:#334155;margin:16px 0">
         ${students
           .map(
             (s) =>
               `<tr><td style="padding:4px 16px 4px 0"><b>${esc(s.name)}</b></td><td style="color:#64748B">${esc(s.grade)} ${esc(s.section)}</td></tr>`
           )
           .join("")}
       </table>
       <p style="font-size:13px;color:#334155">If the school already knows the reason, please ignore this message. Otherwise kindly inform the class teacher or the school office.</p>`
    ),
  });
};

export const sendFeeReminder = ({ to, name, instituteName, total, items }) => {
  const lines = items
    .map((i) => `${i.student} — ${i.title}: Rs. ${i.amount.toLocaleString()} (${i.status.toLowerCase()})`)
    .join("\n");

  return send({
    to,
    subject: `Fee reminder from ${instituteName} — Rs. ${total.toLocaleString()} outstanding`,
    text:
      `Dear ${name},\n\nOutstanding fees at ${instituteName}:\n\n${lines}\n\n` +
      `Total due: Rs. ${total.toLocaleString()}\n\nIf you have already paid, please ignore this message.`,
    html: shell(
      `Outstanding fees at ${esc(instituteName)}`,
      `<p style="font-size:14px;color:#334155;line-height:1.7">Dear ${esc(name)}, our records show the following unpaid fees:</p>
       <table style="font-size:14px;color:#334155;margin:16px 0;border-collapse:collapse;width:100%">
         ${items
           .map(
             (i) =>
               `<tr><td style="padding:6px 0;border-bottom:1px solid #E2E8F0">${esc(i.student)} — ${esc(i.title)}</td>
                <td style="padding:6px 0;border-bottom:1px solid #E2E8F0;text-align:right"><b>Rs. ${i.amount.toLocaleString()}</b></td></tr>`
           )
           .join("")}
         <tr><td style="padding:10px 0"><b>Total due</b></td><td style="padding:10px 0;text-align:right"><b>Rs. ${total.toLocaleString()}</b></td></tr>
       </table>
       <p style="font-size:13px;color:#64748B">If you have already paid, please ignore this message.</p>`
    ),
  });
};

export const sendPasswordChanged = ({ to, name }) =>
  send({
    to,
    subject: "Your EduConnect password was changed",
    text: `Hi ${name},\n\nYour password was just changed. If this wasn't you, contact your school administrator immediately.`,
    html: shell(
      "Your password was changed",
      `<p style="font-size:14px;color:#334155;line-height:1.7">Hi ${esc(name)}, your EduConnect password was just changed and all other sessions were signed out.</p>
       <p style="font-size:14px;color:#C1440E;line-height:1.7"><b>If this wasn't you</b>, contact your school administrator immediately.</p>`
    ),
  });
