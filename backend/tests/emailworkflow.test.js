import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSmtpSink } from "./helpers/smtp-sink.js";

const run = promisify(execFile);
const BACKEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The whole chain, with a mail server on the end of it.
 *
 * Every other email test drives either the service on its own or the API with
 * no relay behind it. This runs the real endpoints — signup, teacher creation,
 * forgot-password, fee reminders, attendance — against a real SMTP server, and
 * then reads what came out the far end.
 *
 * It is one long run inside a single child process because the transport is
 * built at module load from the environment, and because the school these
 * messages are about has to exist for the whole sequence. The child builds a
 * throwaway institute, exercises each path, purges it, and prints what it saw;
 * the assertions live out here where a failure reads properly.
 *
 * No demo account is touched: a reset issued against a seeded user would
 * invalidate a real pending link and leave a live token behind.
 */

const script = (stamp) => `
  import request from "supertest";
  const { default: app } = await import("./src/app.js");
  const { prismaRaw } = await import("./src/config/prisma.js");

  const PW = "MailFlow!2026";
  const stamp = ${JSON.stringify(stamp)};
  const out = { steps: {} };

  const login = async (email, password) => {
    const r = await request(app).post("/api/auth/login").send({ email, password });
    return r.status === 200 ? r.body.data.accessToken : null;
  };
  const as = (t) => ({
    get: (u) => request(app).get(u).set("Authorization", "Bearer " + t),
    post: (u) => request(app).post(u).set("Authorization", "Bearer " + t),
    patch: (u) => request(app).patch(u).set("Authorization", "Bearer " + t),
    delete: (u) => request(app).delete(u).set("Authorization", "Bearer " + t),
  });

  const sa = await login("sa@educonnect.io", "super123");
  const adminEmail = "mf.admin." + stamp + "@test.edu";
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Mail Flow " + stamp, city: "Lahore", phone: "03001234567",
    email: "mf.school." + stamp + "@test.edu", planId: "growth", studentLimit: 50,
    adminName: "Flow Admin", adminEmail, adminPassword: PW,
  });
  const instId = signup.body.data?.institute?.id;
  out.instituteCreated = Boolean(instId);
  if (!instId) { console.log("RESULT" + JSON.stringify(out)); process.exit(0); }

  await as(sa).patch("/api/institutes/" + instId + "/status").send({ status: "ACTIVE" });
  const admin = await login(adminEmail, PW);

  // ── welcome ──────────────────────────────────────────────────────────────
  const teacherEmail = "mf.teacher." + stamp + "@test.edu";
  const teacher = await as(admin).post("/api/teachers").send({
    name: "Hassan Raza", email: teacherEmail, phone: "03001111111", createLogin: true,
  });
  out.steps.welcome = {
    status: teacher.status,
    emailed: teacher.body.data?.emailed,
    message: teacher.body.message,
  };

  // ── welcome, with the preference switched off ────────────────────────────
  await as(admin).patch("/api/institutes/me/notifications").send({ welcomeEmails: false });
  const silentEmail = "mf.silent." + stamp + "@test.edu";
  const silent = await as(admin).post("/api/teachers").send({
    name: "Quiet Teacher", email: silentEmail, phone: "03001111112", createLogin: true,
  });
  out.steps.welcomeOff = {
    status: silent.status,
    emailed: silent.body.data?.emailed,
    message: silent.body.message,
  };
  await as(admin).patch("/api/institutes/me/notifications").send({ welcomeEmails: true });

  // ── password reset, on a throwaway account ───────────────────────────────
  const forgot = await request(app).post("/api/auth/forgot-password").send({ email: teacherEmail });
  out.steps.reset = { status: forgot.status };
  const token = await prismaRaw.passwordResetToken.findFirst({
    where: { user: { email: teacherEmail } },
    orderBy: { createdAt: "desc" },
    select: { id: true, tokenHash: true },
  });
  // The row as stored, so the assertions can compare it with the link that
  // was emailed. There is no column for a raw token; that is the point.
  out.steps.reset.storedHash = token?.tokenHash ?? null;

  // ── fee reminder, with a part payment behind it ──────────────────────────
  const student = (await as(admin).post("/api/students").send({
    name: "Zain Ahmed", grade: "Grade 9", section: "A", rollNo: "MF-" + stamp,
  })).body.data;
  const guardianEmail = "mf.guardian." + stamp + "@test.edu";
  await as(admin).post("/api/parents").send({
    name: "Sara Ahmed", email: guardianEmail, phone: "03002222222",
    studentIds: [student.id], createLogin: true, password: PW,
  });
  const invoice = (await as(admin).post("/api/fees").send({
    studentId: student.id, period: "2026-11", amount: 12500, dueDate: "2026-11-10",
  })).body.data;
  await as(admin).post("/api/fees/" + invoice.id + "/pay").send({ paidAmount: 4000 });
  const remind = await as(admin).post("/api/fees/remind").send({});
  out.steps.feeReminder = {
    status: remind.status,
    sent: remind.body.data?.sent,
    recipients: remind.body.data?.recipients?.map((r) => ({ email: r.email, total: r.total, emailed: r.emailed })),
  };

  // ── fee reminder with the preference off ─────────────────────────────────
  await as(admin).patch("/api/institutes/me/notifications").send({ feeReminders: false });
  const blocked = await as(admin).post("/api/fees/remind").send({});
  out.steps.feeReminderOff = { status: blocked.status, message: blocked.body.message };
  await as(admin).patch("/api/institutes/me/notifications").send({ feeReminders: true });

  // ── absence, and the same register saved twice ───────────────────────────
  // Yesterday rather than a fixed date: a register cannot be taken for a day
  // that has not happened, and a hard-coded one goes stale the moment it does.
  const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const mark = (status) => as(admin).post("/api/attendance/bulk").send({
    date: YESTERDAY, grade: "Grade 9", section: "A",
    records: [{ studentId: student.id, status }],
  });
  const first = await mark("ABSENT");
  const again = await mark("ABSENT");
  out.steps.absence = {
    first: { status: first.status, notified: first.body.data?.guardiansNotified },
    repeat: { status: again.status, notified: again.body.data?.guardiansNotified },
  };

  // ── absence with alerts switched off ─────────────────────────────────────
  await as(admin).patch("/api/institutes/me/notifications").send({ attendanceAlerts: false });
  await mark("PRESENT");
  const quiet = await mark("ABSENT");
  out.steps.absenceOff = { status: quiet.status, notified: quiet.body.data?.guardiansNotified };

  // ── clean up through the application's own lifecycle ─────────────────────
  const removed = await as(sa).delete("/api/institutes/" + instId);
  if (removed.status === 200) await as(sa).delete("/api/institutes/" + instId + "/purge");
  await prismaRaw.institute.delete({ where: { id: instId } }).catch(() => {});
  await prismaRaw.user.deleteMany({ where: { email: { contains: "." + stamp + "@test.edu" } } }).catch(() => {});

  out.emails = { guardianEmail, teacherEmail, silentEmail, adminEmail };
  console.log("RESULT" + JSON.stringify(out));
  process.exit(0);
`;

let sink;
let out;
let ran = false;

beforeAll(async () => {
  sink = await startSmtpSink();
  const stamp = Date.now();
  const { stdout } = await run(
    process.execPath,
    ["--input-type=module", "--eval", script(stamp)],
    {
      cwd: BACKEND,
      env: {
        ...process.env,
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(sink.port),
        SMTP_FROM: "EduConnect <no-reply@test.edu>",
        SMTP_USER: "relay-user",
        SMTP_PASS: "relay-password-must-not-appear",
        // See smtpdelivery.test.js — the local sink has no STARTTLS.
        SMTP_REQUIRE_TLS: "false",
      },
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  const marker = stdout.indexOf("RESULT");
  if (marker === -1) throw new Error(`no RESULT in output:\n${stdout.slice(-3000)}`);
  out = JSON.parse(stdout.slice(marker + 6).split("\n")[0]);
  ran = out.instituteCreated;
  // Give any last send time to land before the assertions read the sink.
  await sink.waitFor(4, 2000);
}, 240000);

afterAll(async () => {
  await sink?.close();

  /**
   * A second sweep, from out here.
   *
   * The child purges what it built, but only if it reaches the end. An early
   * version of this file threw on a bad Prisma select half way through and left
   * a school and three users behind — found later by `db:verify` reporting five
   * institutes instead of four. Cleanup that only runs on the happy path is not
   * cleanup, and the parent process survives a child that does not.
   *
   * Scoped by name and by the @test.edu domain, so it can only ever reach what
   * this file creates.
   */
  const { prismaRaw } = await import("../src/config/prisma.js");
  const orphans = await prismaRaw.institute.findMany({
    where: { name: { startsWith: "Mail Flow " } },
    select: { id: true },
  });
  for (const { id } of orphans) {
    await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  }
  await prismaRaw.user
    .deleteMany({ where: { email: { startsWith: "mf.", endsWith: "@test.edu" } } })
    .catch(() => {});
});

/** Messages that arrived for one address. */
const to = (email) => sink.messages.filter((m) => m.envelopeTo.includes(email));

/**
 * The guard on the guards.
 *
 * Every case below opens with `if (!ran) return`, which is what keeps the file
 * from failing on a machine with no database. Without this one test, a run that
 * never got off the ground would report thirteen passes — which is exactly how
 * a regression test in this project once sat green against code it was supposed
 * to be catching.
 */
describe("the run itself", () => {
  it("built the school and put mail on the wire", () => {
    expect(ran, "the child process never created its institute").toBe(true);
    expect(sink.messages.length, "no message reached the SMTP server").toBeGreaterThan(0);
  });
});

describe("welcome", () => {
  it("emails the new teacher their sign-in details", () => {
    if (!ran) return;
    expect(out.steps.welcome.status).toBe(201);
    expect(out.steps.welcome.emailed).toBe(true);

    const [mail] = to(out.emails.teacherEmail);
    expect(mail, "no welcome message reached the teacher").toBeTruthy();
    expect(mail.subject).toContain("Mail Flow");
    expect(mail.body).toContain(out.emails.teacherEmail);
  });

  /**
   * The message says the details were sent, and they were. When mail does not
   * go out the same endpoint shows the password instead — that half is pinned
   * in email.test.js.
   */
  it("says so in the response the admin reads", () => {
    if (!ran) return;
    expect(out.steps.welcome.message).toContain("sign-in details sent");
  });

  it("sends nothing when the school has welcome emails switched off", () => {
    if (!ran) return;
    expect(out.steps.welcomeOff.status).toBe(201);
    expect(out.steps.welcomeOff.emailed).toBe(false);
    expect(to(out.emails.silentEmail)).toHaveLength(0);
    // The account still exists and the admin is told the password.
    expect(out.steps.welcomeOff.message).toMatch(/temporary password/i);
  });
});

describe("password reset", () => {
  it("sends a link to the address that asked for one", () => {
    if (!ran) return;
    expect(out.steps.reset.status).toBe(200);

    const mail = to(out.emails.teacherEmail).find((m) => m.subject.includes("Reset your"));
    expect(mail, "no reset message was delivered").toBeTruthy();
    expect(mail.body).toContain("/reset");
  });

  /**
   * A reset token stored in plain text is a password: anyone with a read of
   * the table, a backup or a log dump can take over the account.
   *
   * The schema has no column for a raw token, so this compares what went out
   * in the link against what was written down. They must not be the same
   * string — if they ever are, the hashing has been undone somewhere.
   */
  it("stores the token hashed, never in the clear", () => {
    if (!ran) return;
    const stored = out.steps.reset.storedHash;
    expect(stored, "no reset token row was written").toBeTruthy();

    const mail = to(out.emails.teacherEmail).find((m) => m.subject.includes("Reset your"));
    expect(mail).toBeTruthy();

    const link = mail.body.match(/https?:\/\/\S*reset\S*/)?.[0] ?? "";
    expect(link, "the email carried no reset link").toContain("reset");
    expect(link).not.toContain(stored);
  });
});

describe("fee reminder", () => {
  it("reaches the guardian with the balance still owed, not the invoice total", () => {
    if (!ran) return;
    expect(out.steps.feeReminder.status).toBe(200);
    expect(out.steps.feeReminder.sent).toBe(1);

    const [recipient] = out.steps.feeReminder.recipients;
    expect(recipient.email).toBe(out.emails.guardianEmail);
    // 12,500 billed, 4,000 received — a reminder for the full amount would
    // have a parent at the office with a receipt.
    expect(recipient.total).toBe(8500);
    expect(recipient.emailed).toBe(true);

    const mail = to(out.emails.guardianEmail).find((m) => m.subject.includes("Fee reminder"));
    expect(mail, "no fee reminder was delivered").toBeTruthy();
    expect(mail.body).toContain("8,500");
    expect(mail.body).not.toContain("12,500");
  });

  it("refuses outright when the school has reminders switched off", () => {
    if (!ran) return;
    expect(out.steps.feeReminderOff.status).toBe(400);
    expect(out.steps.feeReminderOff.message).toMatch(/turned off/i);
  });
});

describe("absence", () => {
  it("tells the guardian once", () => {
    if (!ran) return;
    expect(out.steps.absence.first.status).toBe(201);
    expect(out.steps.absence.first.notified).toBe(1);
  });

  /**
   * Saving the same register again is ordinary — a teacher corrects one row
   * and presses save. It must not send the guardian a second copy.
   */
  it("does not tell them again when the same register is saved twice", () => {
    if (!ran) return;
    expect(out.steps.absence.repeat.notified).toBe(0);

    const absences = to(out.emails.guardianEmail).filter((m) => m.subject.includes("Absence on"));
    expect(absences).toHaveLength(1);
  });

  it("sends nothing when the school has attendance alerts switched off", () => {
    if (!ran) return;
    expect(out.steps.absenceOff.status).toBe(201);
    expect(out.steps.absenceOff.notified).toBe(0);
    // Still exactly the one from earlier, when alerts were on.
    expect(to(out.emails.guardianEmail).filter((m) => m.subject.includes("Absence on"))).toHaveLength(1);
  });
});

describe("across the whole run", () => {
  it("never sends a guardian another school's business", () => {
    if (!ran) return;
    for (const mail of to(out.emails.guardianEmail)) {
      expect(mail.body).toContain("Mail Flow");
      expect(mail.body).not.toContain("Beaconhouse");
    }
  });

  it("never puts the relay password in a message", () => {
    if (!ran) return;
    for (const mail of sink.messages) {
      expect(mail.raw).not.toContain("relay-password-must-not-appear");
    }
  });

  it("sends everything from the configured address", () => {
    if (!ran) return;
    expect(sink.messages.length).toBeGreaterThan(0);
    for (const mail of sink.messages) expect(mail.envelopeFrom).toBe("no-reply@test.edu");
  });
});
