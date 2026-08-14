import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";
import { accessBlock, hasExpired } from "../src/utils/subscription.js";
import { notificationEnabled, notificationSettings } from "../src/utils/notifications.js";
import { expireLapsedSubscriptions } from "../src/services/maintenance.service.js";

/**
 * Subscription lifecycle and notification preferences.
 *
 * Uses a throwaway institute so the demo data is never disturbed, and asserts
 * against the database rather than the UI.
 */

let inst, adminToken, saToken;
const stamp = Date.now();
const ADMIN_EMAIL = `lifecycle${stamp}@test.edu`;
const PASSWORD = "LifecycleTest123";

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

  const signup = await request(app).post("/api/auth/signup").send({
    name: `Lifecycle School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `school${stamp}@test.edu`,
    planId: "starter",
    studentLimit: 25,
    adminName: "Lifecycle Admin",
    adminEmail: ADMIN_EMAIL,
    adminPassword: PASSWORD,
  });

  inst = signup.body.data.institute.id;
  await as(saToken).patch(`/api/institutes/${inst}/status`).send({ status: "ACTIVE" });
  adminToken = await login(ADMIN_EMAIL, PASSWORD);
});

afterAll(async () => {
  if (inst) await prismaRaw.institute.delete({ where: { id: inst } }).catch(() => {});
});

describe("subscription lifecycle", () => {
  it("starts ACTIVE with the requested seat cap, not the plan maximum", async () => {
    const res = await as(adminToken).get("/api/institutes/me/subscription");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACTIVE");
    expect(res.body.data.studentLimit).toBe(25);
    expect(res.body.data.plan.maxStudents).toBe(200); // starter's raw cap
    expect(res.body.data.cancelAtPeriodEnd).toBe(false);
  });

  it("stays usable after cancelling, until the period ends", async () => {
    const cancel = await as(adminToken).post("/api/institutes/me/subscription/cancel").send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.cancelAtPeriodEnd).toBe(true);
    expect(new Date(cancel.body.data.subscriptionEndsAt).getTime()).toBeGreaterThan(Date.now());

    // Cancellation is end-of-period: nothing is blocked yet.
    expect((await as(adminToken).get("/api/students")).status).toBe(200);
    expect(await login(ADMIN_EMAIL, PASSWORD)).toBeTruthy();
  });

  it("blocks access the moment the end date passes — before any sweep runs", async () => {
    // Backdate the end of the paid period.
    await prismaRaw.institute.update({
      where: { id: inst },
      data: { subscriptionEndsAt: new Date(Date.now() - 60_000) },
    });

    // Status in the database is still ACTIVE — expiry is computed from the date.
    const row = await prismaRaw.institute.findUnique({ where: { id: inst } });
    expect(row.status).toBe("ACTIVE");
    expect(hasExpired(row)).toBe(true);

    const blocked = await as(adminToken).get("/api/students");
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/subscription has expired/i);

    const relogin = await request(app).post("/api/auth/login").send({ email: ADMIN_EMAIL, password: PASSWORD });
    expect(relogin.status).toBe(403);
    expect(relogin.body.message).toMatch(/subscription has expired/i);
  });

  it("cannot be bypassed by calling the API directly", async () => {
    // Every one of these goes through authenticate, so all are refused.
    for (const url of [
      "/api/students",
      "/api/teachers",
      "/api/notices",
      "/api/dashboard/admin",
      "/api/institutes/me/subscription",
    ]) {
      const res = await as(adminToken).get(url);
      expect(res.status, `${url} should be blocked`).toBe(403);
    }
  });

  it("the sweep records EXPIRED so listings match reality", async () => {
    await expireLapsedSubscriptions();
    const row = await prismaRaw.institute.findUnique({ where: { id: inst } });
    expect(row.status).toBe("EXPIRED");
  });

  it("keeps a super admin able to see and manage an expired institute", async () => {
    const list = await as(saToken).get("/api/institutes?limit=100");
    expect(list.status).toBe(200);
    const found = list.body.data.find((i) => i.id === inst);
    expect(found).toBeTruthy();
    expect(found.status).toBe("EXPIRED");
  });

  it("does not delete any data when a subscription expires", async () => {
    const row = await prismaRaw.institute.findUnique({
      where: { id: inst },
      include: { _count: { select: { users: true } } },
    });
    expect(row).not.toBeNull();
    expect(row._count.users).toBeGreaterThan(0);
  });

  it("restores access when the subscription is reactivated", async () => {
    await as(saToken).patch(`/api/institutes/${inst}/status`).send({ status: "ACTIVE" });
    await prismaRaw.institute.update({
      where: { id: inst },
      data: { cancelAtPeriodEnd: false, subscriptionEndsAt: null },
    });

    const token = await login(ADMIN_EMAIL, PASSWORD);
    expect(token).toBeTruthy();
    expect((await as(token).get("/api/students")).status).toBe(200);
    adminToken = token;
  });
});

describe("notification preferences", () => {
  it("returns defaults before anything is saved", async () => {
    const res = await as(adminToken).get("/api/institutes/me/notifications");
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.data.map((p) => [p.key, p.enabled]));
    expect(byKey.feeReminders).toBe(true);
    expect(byKey.noticeEmails).toBe(false);
    // Each toggle states what it actually controls.
    expect(res.body.data.every((p) => p.controls)).toBe(true);
  });

  it("persists a change across a reload", async () => {
    const patch = await as(adminToken)
      .patch("/api/institutes/me/notifications")
      .send({ feeReminders: false });
    expect(patch.status).toBe(200);

    const reread = await as(adminToken).get("/api/institutes/me/notifications");
    const byKey = Object.fromEntries(reread.body.data.map((p) => [p.key, p.enabled]));
    expect(byKey.feeReminders).toBe(false);
    expect(byKey.welcomeEmails).toBe(true); // untouched keys survive
  });

  it("actually stops the action, not just the switch", async () => {
    // feeReminders is off from the previous test.
    const blocked = await as(adminToken).post("/api/fees/remind").send({});
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/turned off/i);

    await as(adminToken).patch("/api/institutes/me/notifications").send({ feeReminders: true });
    const allowed = await as(adminToken).post("/api/fees/remind").send({});
    expect(allowed.status).toBe(200); // no unpaid invoices, but permitted
  });

  it("ignores unknown keys instead of storing junk", async () => {
    const res = await as(adminToken)
      .patch("/api/institutes/me/notifications")
      .send({ notARealSetting: true });
    expect(res.status).toBe(400);

    const row = await prismaRaw.institute.findUnique({ where: { id: inst } });
    expect(Object.keys(row.notificationSettings ?? {})).not.toContain("notARealSetting");
  });
});

describe("accessBlock rules", () => {
  const base = { status: "ACTIVE", cancelAtPeriodEnd: false, subscriptionEndsAt: null };

  it("allows an active institute", () => {
    expect(accessBlock(base)).toBeNull();
  });

  it("blocks suspended, cancelled and expired with distinct messages", () => {
    expect(accessBlock({ ...base, status: "SUSPENDED" }).message).toMatch(/suspended/i);
    expect(accessBlock({ ...base, status: "CANCELLED" }).message).toMatch(/closed/i);
    expect(accessBlock({ ...base, status: "EXPIRED" }).message).toMatch(/expired/i);
  });

  it("treats a lapsed end date as expired even while stored ACTIVE", () => {
    const lapsed = { ...base, cancelAtPeriodEnd: true, subscriptionEndsAt: new Date(Date.now() - 1000) };
    expect(accessBlock(lapsed).status).toBe("EXPIRED");
  });

  it("does not block during the paid grace period", () => {
    const future = { ...base, cancelAtPeriodEnd: true, subscriptionEndsAt: new Date(Date.now() + 86_400_000) };
    expect(accessBlock(future)).toBeNull();
  });
});

describe("notification defaults", () => {
  it("falls back to defaults for an institute that has never saved settings", () => {
    expect(notificationSettings({}).feeReminders).toBe(true);
    expect(notificationEnabled({}, "noticeEmails")).toBe(false);
  });

  it("ignores non-boolean stored values", () => {
    const s = notificationSettings({ notificationSettings: { feeReminders: "yes" } });
    expect(s.feeReminders).toBe(true); // default, not the string
  });
});
