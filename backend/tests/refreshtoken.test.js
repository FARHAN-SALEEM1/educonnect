import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";

/**
 * The refresh token must never reach JavaScript.
 *
 * It used to be obtainable with `?tokenInBody=1`, a plain query parameter any
 * caller could set — including injected script, which only needed
 * `fetch("/api/auth/refresh?tokenInBody=1", { credentials: "include" })` to
 * walk off with a seven-day credential. The httpOnly cookie was decorative for
 * as long as that switch existed.
 *
 * These tests pin the guarantee from both directions: no response ever carries
 * the token, and no request can supply one in a body.
 */

const EMAIL = "admin@bhs.edu";
const PASSWORD = "admin123";
let seeded = true;

const login = (query = "", body = {}) =>
  request(app).post(`/api/auth/login${query}`).send({ email: EMAIL, password: PASSWORD, ...body });

/** The refresh cookie's raw value, straight from Set-Cookie. */
const cookieFrom = (res) => {
  const jar = res.headers["set-cookie"] ?? [];
  const row = jar.find((c) => c.startsWith("educonnect_rt="));
  return row ? row.split(";")[0].split("=").slice(1).join("=") : null;
};

beforeAll(async () => {
  const res = await login();
  if (res.status !== 200) seeded = false;
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

describe("no response exposes the refresh token", () => {
  it("omits it from a plain login", async () => {
    if (skip()) return;
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  it("ignores the old ?tokenInBody=1 query switch", async () => {
    if (skip()) return;
    for (const q of ["?tokenInBody=1", "?tokenInBody=true", "?tokeninbody=1", "?tokenInBody=1&x=2"]) {
      const res = await login(q);
      expect(res.status, `${q} should still log in`).toBe(200);
      expect(res.body.data.refreshToken, `${q} must not return the token`).toBeUndefined();
    }
  });

  it("ignores a tokenInBody flag in the body", async () => {
    if (skip()) return;
    const res = await login("", { tokenInBody: true });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  it("omits it from refresh, the route that used to leak it", async () => {
    if (skip()) return;
    const first = await login();
    const cookie = first.headers["set-cookie"];

    const res = await request(app)
      .post("/api/auth/refresh?tokenInBody=1")
      .set("Cookie", cookie)
      .send({ tokenInBody: true });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  it("keeps the token out of every response body, whole-payload check", async () => {
    if (skip()) return;
    const first = await login();
    const secret = cookieFrom(first);
    expect(secret, "login must still set the cookie").toBeTruthy();

    // The exact credential must appear nowhere in the serialised payload.
    expect(JSON.stringify(first.body)).not.toContain(secret);

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", first.headers["set-cookie"])
      .send({});
    expect(refreshed.status).toBe(200);
    const rotated = cookieFrom(refreshed);
    expect(rotated).toBeTruthy();
    expect(JSON.stringify(refreshed.body)).not.toContain(rotated);
  });
});

describe("the cookie is the only channel", () => {
  it("marks the cookie httpOnly and scopes it to the auth routes", async () => {
    if (skip()) return;
    const res = await login();
    const row = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("educonnect_rt="));
    expect(row).toBeTruthy();
    expect(row).toMatch(/HttpOnly/i);
    expect(row).toMatch(/Path=\/api\/auth/i);
    expect(row).toMatch(/SameSite=/i);
  });

  it("refuses a refresh token supplied in the body", async () => {
    if (skip()) return;
    // A token lifted by any other means must not be replayable without the
    // cookie — the body is no longer read.
    const first = await login();
    const stolen = cookieFrom(first);

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: stolen });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no refresh token/i);
  });

  it("still refuses a refresh with neither cookie nor body", async () => {
    if (skip()) return;
    const res = await request(app).post("/api/auth/refresh").send({});
    expect(res.status).toBe(401);
  });
});

describe("rotation and revocation survive the change", () => {
  it("issues a different token on refresh and kills the old one", async () => {
    if (skip()) return;
    const first = await login();
    const original = first.headers["set-cookie"];
    const originalValue = cookieFrom(first);

    const refreshed = await request(app).post("/api/auth/refresh").set("Cookie", original).send({});
    expect(refreshed.status).toBe(200);
    expect(cookieFrom(refreshed)).not.toBe(originalValue);

    const replay = await request(app).post("/api/auth/refresh").set("Cookie", original).send({});
    expect(replay.status).toBe(401);
  });

  it("lets the rotated cookie carry on working", async () => {
    if (skip()) return;
    const first = await login();
    const refreshed = await request(app)
      .post("/api/auth/refresh").set("Cookie", first.headers["set-cookie"]).send({});

    const again = await request(app)
      .post("/api/auth/refresh").set("Cookie", refreshed.headers["set-cookie"]).send({});
    expect(again.status).toBe(200);
    expect(again.body.data.accessToken).toBeTruthy();
  });

  it("revokes the session on logout", async () => {
    if (skip()) return;
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    expect((await agent.post("/api/auth/logout").send({})).status).toBe(200);
    expect((await agent.post("/api/auth/refresh").send({})).status).toBe(401);
  });

  it("hands out a working access token through the whole cycle", async () => {
    if (skip()) return;
    const first = await login();
    const refreshed = await request(app)
      .post("/api/auth/refresh").set("Cookie", first.headers["set-cookie"]).send({});

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(EMAIL);
  });
});
