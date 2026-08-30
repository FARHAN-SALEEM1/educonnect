import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { hashToken } from "../src/utils/jwt.js";

/**
 * Refresh-token reuse detection (H5) and admin-forced reset (H6).
 *
 * Rotation revokes a token the moment it is exchanged, so a revoked-but-
 * unexpired token turning up again means either a client replayed one it should
 * have dropped or somebody else is holding a copy. Either way the family is no
 * longer trustworthy, so every live session for that account is revoked.
 *
 * ── Tenancy ────────────────────────────────────────────────────────────────
 *
 * This spec used to run entirely against seeded demo accounts, and the header
 * claimed "No seeded record is modified" — which was not true of what it did:
 *
 *   • it drove reuse detection on `admin@bhs.edu`, whose whole point is to
 *     revoke **every live session** for that account, so a real admin signed in
 *     elsewhere was silently cut off;
 *   • it forced a password reset on `hassan@bhs.edu` and on `sara@gmail.com`,
 *     revoking their sessions too;
 *   • and it cleaned up with `passwordResetToken.deleteMany({ where: { userId } })`
 *     on those seeded users — which sweeps any reset token they already had,
 *     not just the one the test made. A pre-existing token did disappear that
 *     way.
 *
 * Revoking sessions and destroying reset tokens are exactly the operations
 * under test, so there is no version of this that is safe to point at real
 * accounts. It now signs up throwaway schools of its own and does all of it to
 * users it created, then erases those schools through the application's own
 * lifecycle — `DELETE /institutes/:id` followed by `/purge` — which cascades
 * users, and through them every refresh and reset token they held.
 */

let sa, admin, adminUserId, instId, seeded = true;
let teacherUserId, parentUserId, parentEmail, parentPassword;
let bystander = {};
const made = [];
const stamp = Date.now();
const PASSWORD = "TokenSpec!2026";

const signIn = (email, password) =>
  request(app).post("/api/auth/login").send({ email, password });
const tokenFor = async (email, password) => {
  const res = await signIn(email, password);
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});

/** The spec's own admin signing in — every H5 test drives reuse on this account. */
const login = () => signIn(`rot.admin.${stamp}@test.edu`, PASSWORD);
const refreshWith = (cookie) =>
  request(app).post("/api/auth/refresh").set("Cookie", cookie).send({});

const liveSessionsOf = (id) =>
  prismaRaw.refreshToken.count({ where: { userId: id, revokedAt: null } });
const liveSessions = () => liveSessionsOf(adminUserId);

/** A throwaway school with its own admin. */
const makeSchool = async (label) => {
  const adminEmail = `rot.${label}.${stamp}@test.edu`;
  const res = await request(app).post("/api/auth/signup").send({
    name: `Rotation ${label} School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `rot.school.${label}.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: `Rotation ${label} Admin`,
    adminEmail,
    adminPassword: PASSWORD,
  });
  const id = res.body.data?.institute?.id;
  if (!id) return {};
  made.push(id);
  await as(sa).patch(`/api/institutes/${id}/status`).send({ status: "ACTIVE" });
  return { id, adminEmail, token: await tokenFor(adminEmail, PASSWORD) };
};

/**
 * Erases one school the way the product does: to the recycle bin, then purged.
 * Users cascade with the institute, and refresh and reset tokens cascade with
 * the users — so the only thing this can ever name is a single institute id.
 */
const purgeSchool = async (id) => {
  const removed = await as(sa).delete(`/api/institutes/${id}`);
  const purged = removed.status === 200 ? await as(sa).delete(`/api/institutes/${id}/purge`) : null;
  if (purged?.status === 200) return true;
  await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  return false;
};

/** Writes a reset token straight in, mirroring what forgotPassword stores. */
const plantResetToken = async (userId, marker) => {
  const plain = `${marker}-${Math.random().toString(36).slice(2)}`.padEnd(40, "x");
  await prismaRaw.passwordResetToken.create({
    data: {
      tokenHash: hashToken(plain),
      userId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  return plain;
};

const userIdFor = (email) =>
  prismaRaw.user.findUnique({ where: { email }, select: { id: true } }).then((u) => u?.id ?? null);

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const main = await makeSchool("admin");
  if (!main.id || !main.token) { seeded = false; return; }
  instId = main.id;
  admin = main.token;
  adminUserId = await userIdFor(main.adminEmail);

  // A teacher and a parent of this school — the two H6 reset targets.
  const teacherEmail = `rot.teacher.${stamp}@test.edu`;
  await as(admin).post("/api/teachers").send({
    name: "Rotation Teacher", email: teacherEmail, phone: "03001111111",
    subject: "Mathematics", createLogin: true, password: PASSWORD,
  });
  teacherUserId = await userIdFor(teacherEmail);

  parentEmail = `rot.parent.${stamp}@test.edu`;
  parentPassword = PASSWORD;
  await as(admin).post("/api/parents").send({
    name: "Rotation Parent", email: parentEmail, phone: "03002222222",
    relation: "Father", createLogin: true, password: PASSWORD,
  });
  parentUserId = await userIdFor(parentEmail);

  if (!adminUserId || !teacherUserId || !parentUserId) { seeded = false; return; }

  /**
   * A second school that this spec never touches, holding one live session and
   * one reset token. Everything H5 and H6 do below happens while these exist;
   * the regression at the bottom checks they are still exactly as they were.
   */
  bystander = await makeSchool("bystander");
  if (!bystander.id || !bystander.token) { seeded = false; return; }
  bystander.userId = await userIdFor(bystander.adminEmail);
  bystander.sessions = await liveSessionsOf(bystander.userId);
  bystander.resetPlain = await plantResetToken(bystander.userId, `bystander-${stamp}`);
});

afterAll(async () => {
  for (const id of made) await purgeSchool(id);
  await prismaRaw.user
    .deleteMany({ where: { email: { contains: `.${stamp}@test.edu` } } })
    .catch(() => {});
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

describe("H5 — replaying a rotated refresh token kills the family", () => {
  it("refuses the replay", async () => {
    if (skip()) return;
    const first = await login();
    const cookie = first.headers["set-cookie"];

    expect((await refreshWith(cookie)).status).toBe(200); // rotates
    const replay = await refreshWith(cookie);
    expect(replay.status).toBe(401);
  });

  it("revokes every other live session for that account", async () => {
    if (skip()) return;
    // Three devices, one of which will have its token replayed.
    const victim = await login();
    const deviceB = await login();
    const deviceC = await login();
    expect(await liveSessions()).toBeGreaterThanOrEqual(3);

    const stolen = victim.headers["set-cookie"];
    await refreshWith(stolen); // legitimate rotation
    await refreshWith(stolen); // the replay — detection fires here

    expect(await liveSessions()).toBe(0);

    // The other devices are cut off too, which is the point.
    expect((await refreshWith(deviceB.headers["set-cookie"])).status).toBe(401);
    expect((await refreshWith(deviceC.headers["set-cookie"])).status).toBe(401);
  });

  it("says the session was ended for security, not that the token was odd", async () => {
    if (skip()) return;
    const first = await login();
    const cookie = first.headers["set-cookie"];
    await refreshWith(cookie);
    const replay = await refreshWith(cookie);
    expect(replay.body.message).toMatch(/ended for security/i);
  });

  it("records the event in the audit trail", async () => {
    if (skip()) return;
    const before = await prismaRaw.auditLog.count({ where: { action: "auth.refresh_reuse" } });
    const first = await login();
    const cookie = first.headers["set-cookie"];
    await refreshWith(cookie);
    await refreshWith(cookie);
    // Auditing is fire-and-forget, so allow it a moment to land.
    await new Promise((r) => setTimeout(r, 300));
    expect(await prismaRaw.auditLog.count({ where: { action: "auth.refresh_reuse" } }))
      .toBeGreaterThan(before);
  });

  it("leaves an ordinary rotation chain working", async () => {
    if (skip()) return;
    let cookie = (await login()).headers["set-cookie"];
    for (let i = 0; i < 3; i += 1) {
      const res = await refreshWith(cookie);
      expect(res.status, `rotation ${i} should succeed`).toBe(200);
      cookie = res.headers["set-cookie"];
    }
  });

  it("does not treat an unknown token as reuse", async () => {
    if (skip()) return;
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", ["educonnect_rt=not-a-real-token"])
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.message).not.toMatch(/ended for security/i);
  });
});

describe("H6 — admin reset sends a link, never a password", () => {
  it("returns no password or token in the response", async () => {
    if (skip()) return;
    const token = (await login()).body.data.accessToken;

    const res = await request(app)
      .post(`/api/users/${teacherUserId}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(res.body.data.password).toBeUndefined();
    expect(body).not.toMatch(/"password"/);
    expect(body).not.toMatch(/token/i);
    expect(res.body.data.email).toBe(`rot.teacher.${stamp}@test.edu`);
  });

  it("issues a single-use reset token and signs the account out", async () => {
    if (skip()) return;
    const token = (await login()).body.data.accessToken;

    // Give the target a live session first.
    await signIn(parentEmail, parentPassword);
    expect(await liveSessionsOf(parentUserId)).toBeGreaterThan(0);

    await request(app)
      .post(`/api/users/${parentUserId}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(await liveSessionsOf(parentUserId)).toBe(0);
    const tokens = await prismaRaw.passwordResetToken.findMany({
      where: { userId: parentUserId, usedAt: null },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toHaveLength(64); // stored hashed
  });

  it("still refuses a target in another institute", async () => {
    if (skip()) return;
    const token = (await login()).body.data.accessToken;
    const res = await request(app)
      .post(`/api/users/${bystander.userId}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });
});

/**
 * The two regressions this rewrite exists for.
 *
 * Everything above revokes sessions and creates reset tokens on purpose. What
 * has to be true afterwards is that it happened only to accounts this spec
 * owns, and that erasing the spec's schools leaves nothing of them behind.
 */
describe("nothing outside this spec is disturbed", () => {
  it("leaves another user's live session and reset token exactly as they were", async () => {
    if (skip()) return;

    // Its session survived every reuse-detection sweep above.
    expect(await liveSessionsOf(bystander.userId)).toBe(bystander.sessions);
    expect(bystander.sessions).toBeGreaterThan(0);

    // And the reset token planted before any of it is still there, unused —
    // the old cleanup deleted reset tokens by userId with no scope beyond that,
    // which is how a pre-existing one was swept.
    const survivor = await prismaRaw.passwordResetToken.findFirst({
      where: { tokenHash: hashToken(bystander.resetPlain) },
      select: { userId: true, usedAt: true },
    });
    expect(survivor, "the bystander's reset token must still exist").toBeTruthy();
    expect(survivor.userId).toBe(bystander.userId);
    expect(survivor.usedAt).toBeNull();
  });

  it("never touched a seeded demo account", async () => {
    if (skip()) return;
    const demo = await prismaRaw.user.findMany({
      where: { email: { in: ["admin@bhs.edu", "hassan@bhs.edu", "sara@gmail.com", "admin@lacas.edu"] } },
      select: { email: true, id: true },
    });
    // Whatever sessions they hold, this spec neither created nor revoked any:
    // it never signs in as them and never names them as a reset target.
    for (const u of demo) {
      const mine = await prismaRaw.refreshToken.count({
        where: { userId: u.id, createdAt: { gte: new Date(stamp) } },
      });
      expect(mine, `${u.email} gained a session from this spec`).toBe(0);
    }
  });

  it("takes its own users, sessions and reset tokens with it when purged", async () => {
    if (skip()) return;
    const doomed = await makeSchool("doomed");
    if (!doomed.token) return;

    const userId = await userIdFor(doomed.adminEmail);
    await signIn(doomed.adminEmail, PASSWORD);
    await plantResetToken(userId, `doomed-${stamp}`);

    expect(await liveSessionsOf(userId)).toBeGreaterThan(0);
    expect(await prismaRaw.passwordResetToken.count({ where: { userId } })).toBe(1);

    await purgeSchool(doomed.id);
    made.splice(made.indexOf(doomed.id), 1);

    expect(await prismaRaw.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prismaRaw.refreshToken.count({ where: { userId } })).toBe(0);
    expect(await prismaRaw.passwordResetToken.count({ where: { userId } })).toBe(0);
    expect(await prismaRaw.institute.findUnique({ where: { id: doomed.id } })).toBeNull();
  });
});
