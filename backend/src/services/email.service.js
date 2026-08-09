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
  transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  console.log(`[email] SMTP configured: ${env.smtp.host}:${env.smtp.port}`);
} else {
  console.log("[email] No SMTP configured — emails will be written to the console");
}

export const emailEnabled = () => Boolean(transport);

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
      `<p style="font-size:14px;color:#334155;line-height:1.7">Hi ${name}, use the button below to set a new password. The link is valid for <b>${expiresMinutes} minutes</b> and can be used once.</p>
       <p style="margin:24px 0"><a href="${resetUrl}" style="background:#1B4332;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block">Set a new password</a></p>
       <p style="font-size:12px;color:#64748B;line-height:1.7">If the button doesn't work, paste this into your browser:<br/><span style="word-break:break-all;color:#2D6A4F">${resetUrl}</span></p>
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
      `Your account at ${instituteName}`,
      `<p style="font-size:14px;color:#334155;line-height:1.7">Hi ${name}, an account has been created for you as <b>${role}</b>.</p>
       <table style="font-size:14px;color:#334155;margin:16px 0">
         <tr><td style="padding:4px 16px 4px 0;color:#64748B">Email</td><td><b>${to}</b></td></tr>
         <tr><td style="padding:4px 16px 4px 0;color:#64748B">Temporary password</td><td><b>${tempPassword}</b></td></tr>
       </table>
       <p style="margin:24px 0"><a href="${loginUrl}" style="background:#1B4332;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block">Sign in</a></p>
       <p style="font-size:13px;color:#334155">Please change your password once you're in.</p>`
    ),
  });

export const sendPasswordChanged = ({ to, name }) =>
  send({
    to,
    subject: "Your EduConnect password was changed",
    text: `Hi ${name},\n\nYour password was just changed. If this wasn't you, contact your school administrator immediately.`,
    html: shell(
      "Your password was changed",
      `<p style="font-size:14px;color:#334155;line-height:1.7">Hi ${name}, your EduConnect password was just changed and all other sessions were signed out.</p>
       <p style="font-size:14px;color:#C1440E;line-height:1.7"><b>If this wasn't you</b>, contact your school administrator immediately.</p>`
    ),
  });
