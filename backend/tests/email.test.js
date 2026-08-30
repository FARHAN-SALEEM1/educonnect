import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { emailEnabled, undeliveredReason, esc } from "../src/services/email.service.js";

/**
 * What the API tells you about mail it tried to send.
 *
 * Every send is deliberately swallowed so a failed notification cannot fail
 * the operation that triggered it. That is the right call and it has a cost:
 * an account created with a generated password is unreachable the moment
 * nobody is told what the password was. These pin the rule that fell out of
 * that — when mail does not land, for any reason, the credentials appear on
 * screen and the response says why.
 *
 * Everything runs against a throwaway institute, deleted in afterAll, so the
 * demo data is never touched.
 */

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..");

let inst, adminToken, saToken, seeded = true;
const stamp = Date.now();
const ADMIN_EMAIL = `mail${stamp}@test.edu`;
const PASSWORD = "MailReadiness123";

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

beforeAll(async () => {
  saToken = await login("sa@educonnect.io", "super123");
  if (!saToken) { seeded = false; return; }

  const signup = await request(app).post("/api/auth/signup").send({
    name: `Mail Readiness School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `mailschool${stamp}@test.edu`,
    planId: "starter",
    studentLimit: 25,
    adminName: "Mail Admin",
    adminEmail: ADMIN_EMAIL,
    adminPassword: PASSWORD,
  });
  inst = signup.body.data?.institute?.id;
  if (!inst) { seeded = false; return; }

  await as(saToken).patch(`/api/institutes/${inst}/status`).send({ status: "ACTIVE" });
  adminToken = await login(ADMIN_EMAIL, PASSWORD);
  if (!adminToken) seeded = false;
});

afterAll(async () => {
  if (inst) await prismaRaw.institute.delete({ where: { id: inst } }).catch(() => {});
});

const skip = () => !seeded;

/**
 * The setup ran.
 *
 * Every test below opens with `if (skip()) return`, which lets this file stand
 * down on an unseeded machine — and which also turns a broken `beforeAll` into
 * a column of green ticks. This is the one check that does not skip when the
 * seed is actually there. See tests/helpers/fixtures.js for what it cost.
 */
it("built its fixtures", async () => {
  const { seedPresent } = await import("./helpers/fixtures.js");
  if (!(await seedPresent())) return;
  expect(seeded, "beforeAll did not complete — every test in this file is vacuous").toBe(
    true
  );
});

/** Grabs the generated password out of a response message, if it is there. */
const passwordIn = (message) => (message.match(/Temporary password: (\S+?)[\s)]/) ?? [])[1] ?? null;

describe("creating an account when the mail did not go out", () => {
  it("shows the generated password instead of claiming it was emailed", async () => {
    if (skip()) return;
    const res = await as(adminToken).post("/api/teachers").send({
      name: "Mail Probe One", email: `probe1.${stamp}@test.edu`,
      phone: "03001234567", subject: "Mathematics", createLogin: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.emailed).toBe(false);
    expect(passwordIn(res.body.message)).toBeTruthy();
    expect(res.body.message).not.toContain("sign-in details sent");
  });

  it("says so when the institute has welcome emails switched off", async () => {
    if (skip()) return;
    await as(adminToken).patch("/api/institutes/me/notifications").send({ welcomeEmails: false });

    const res = await as(adminToken).post("/api/teachers").send({
      name: "Mail Probe Two", email: `probe2.${stamp}@test.edu`,
      phone: "03001234567", subject: "Physics", createLogin: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.emailed).toBe(false);
    // The account must not be stranded just because a toggle is off.
    expect(passwordIn(res.body.message)).toBeTruthy();
    expect(res.body.message).toContain("welcome emails are turned off");

    await as(adminToken).patch("/api/institutes/me/notifications").send({ welcomeEmails: true });
  });

  it("does the same for a parent", async () => {
    if (skip()) return;
    const res = await as(adminToken).post("/api/parents").send({
      name: "Mail Probe Guardian", email: `probe3.${stamp}@test.edu`,
      phone: "03001234567", relation: "Father", createLogin: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.emailed).toBe(false);
    expect(passwordIn(res.body.message)).toBeTruthy();
  });

  /**
   * This one covers `POST /users` with no password — the path that had no
   * coverage at all, and where a missing import would have gone unnoticed.
   */
  it("does the same for a user created by the super admin", async () => {
    if (skip()) return;
    const res = await as(saToken).post("/api/users").send({
      name: "Mail Probe Admin", email: `probe4.${stamp}@test.edu`,
      role: "ADMIN", instituteId: inst,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.emailed).toBe(false);
    expect(passwordIn(res.body.message)).toBeTruthy();
  });

  it("says nothing about a password the admin chose themselves", async () => {
    if (skip()) return;
    const res = await as(adminToken).post("/api/teachers").send({
      name: "Mail Probe Five", email: `probe5.${stamp}@test.edu`,
      phone: "03001234567", subject: "Chemistry", createLogin: true,
      password: "ChosenByAdmin123",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.emailed).toBe(false);
    expect(res.body.message).toContain("with the password you set");
    expect(passwordIn(res.body.message)).toBeNull();
  });
});

describe("undeliveredReason", () => {
  it("names each cause in words an admin can act on", () => {
    expect(undeliveredReason("smtp-not-configured")).toBe("no mail server configured");
    expect(undeliveredReason("welcome-emails-off")).toBe(
      "welcome emails are turned off for this institute"
    );
    expect(undeliveredReason("ECONNREFUSED")).toBe("the email could not be delivered");
    expect(undeliveredReason(undefined)).toBe("the email could not be delivered");
  });
});

/**
 * The case that started this: SMTP *is* configured, so the old code reported
 * "sign-in details sent" — but the relay refuses every message, so nobody ever
 * receives the password.
 *
 * A separate process because the transport is built once, at module load, from
 * the environment. 127.0.0.1:1 refuses immediately, so the send fails fast and
 * deterministically without reaching any real mail server.
 */
describe("when SMTP is configured but every send fails", () => {
  it("reports the failure and shows the password", async () => {
    if (skip()) return;

    const script = `
      import request from "supertest";
      const { default: app } = await import("./src/app.js");
      const login = async (e, p) => (await request(app).post("/api/auth/login").send({ email: e, password: p })).body.data.accessToken;
      const token = await login(${JSON.stringify(ADMIN_EMAIL)}, ${JSON.stringify(PASSWORD)});
      const res = await request(app).post("/api/teachers")
        .set("Authorization", "Bearer " + token)
        .send({ name: "Mail Probe Relay", email: "probe.relay.${stamp}@test.edu",
                phone: "03001234567", subject: "Biology", createLogin: true });
      console.log("RESULT" + JSON.stringify({ status: res.status, emailed: res.body.data?.emailed, message: res.body.message }));
      process.exit(0);
    `;

    const { stdout } = await run(
      process.execPath,
      ["--input-type=module", "--eval", script],
      {
        cwd: BACKEND,
        env: { ...process.env, SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_FROM: "EduConnect <no-reply@test.edu>" },
        timeout: 60000,
      }
    );

    const out = JSON.parse(stdout.slice(stdout.indexOf("RESULT") + 6).split("\n")[0]);
    expect(out.status).toBe(201);
    expect(out.emailed).toBe(false);
    expect(out.message).toContain("could not be delivered");
    expect(passwordIn(out.message)).toBeTruthy();
    expect(out.message).not.toContain("sign-in details sent");
  }, 90000);
});

/**
 * Names, institute names and invoice titles are free text — the schemas only
 * bound their length — and they are interpolated into the HTML body of mail
 * that goes to guardians. An admin should not be able to put a link into a
 * student name and have it render in every parent's inbox.
 */
describe("esc", () => {
  it("neutralises markup", () => {
    expect(esc('<a href="http://evil.example">Click</a>')).toBe(
      "&lt;a href=&quot;http://evil.example&quot;&gt;Click&lt;/a&gt;"
    );
    expect(esc("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(esc('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("escapes the ampersand first, so nothing double-decodes", () => {
    expect(esc("Zain & Co")).toBe("Zain &amp; Co");
    expect(esc("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary names alone and survives empty input", () => {
    expect(esc("Ayesha Khan")).toBe("Ayesha Khan");
    expect(esc("O’Brien")).toBe("O’Brien");
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

/**
 * The suite must never be pointed at a real mail relay.
 *
 * Almost every spec here creates teachers, parents or registers, and each of
 * those sends mail. The addresses are fixtures — `@test.edu` and the like — so
 * a live relay would be handed hundreds of undeliverable recipients on every
 * run. That is how a sending account gets rate-limited and then suspended.
 *
 * This was harmless until 2026-08-30, when SMTP was configured in .env for the
 * first time and the whole suite quietly acquired a live transport. The fix is
 * in vitest.config.js; this is the check that says whether it is still working.
 *
 * The specs that genuinely test delivery do not rely on this — they spawn
 * their own process pointed at a local sink (tests/helpers/smtp-sink.js).
 */
describe("the suite is not wired to a live relay", () => {
  it("runs the mail service in console mode", () => {
    expect(
      emailEnabled(),
      "SMTP is live inside the test process — check the env block in vitest.config.js"
    ).toBe(false);
  });
});
