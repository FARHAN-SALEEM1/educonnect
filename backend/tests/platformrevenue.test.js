import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * The revenue breakdown has to add up to the revenue.
 *
 * `mrr` counted only ACTIVE institutes; `planDistribution` counted every
 * institute on each plan. On the Super Admin dashboard those sit in the same
 * card — a per-plan list with Total MRR underneath — so with one suspended
 * school the parts read Rs. 65,995 under a total of Rs. 60,996, and nothing on
 * the screen said which was right.
 *
 * These assert the *invariant* rather than any particular figure: the platform
 * is shared, so absolute totals move whenever any school is added or has its
 * status changed. What must always hold is that the breakdown sums to the
 * headline, and that a school which is not paying appears in neither.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "PlatformRev123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

let sa, instId, planId, planPrice;
let seeded = true;

const platform = async () => (await as(sa).get("/api/dashboard/superadmin")).body.data;
const sumOfPlans = (d) =>
  (d.planDistribution ?? []).reduce((n, p) => n + p.monthlyRevenue, 0);
const setStatus = (status) =>
  as(sa).patch(`/api/institutes/${instId}/status`).send({ status });

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const signup = await request(app).post("/api/auth/signup").send({
    name: `Platform Revenue School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `pr.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "PR Admin",
    adminEmail: `pr.admin.${stamp}@test.edu`,
    adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) {
    seeded = false;
    return;
  }

  const inst = await prismaRaw.institute.findUnique({
    where: { id: instId },
    select: { planId: true, plan: { select: { price: true } } },
  });
  planId = inst?.planId;
  planPrice = inst?.plan?.price;
  if (!planId || !planPrice) seeded = false;
}, 60_000);

afterAll(async () => {
  if (instId) await prismaRaw.institute.delete({ where: { id: instId } }).catch(() => {});
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

describe("the plan breakdown and the headline MRR", () => {
  it("agree while the school is active", async () => {
    if (skip()) return;
    await setStatus("ACTIVE");

    const d = await platform();
    expect(sumOfPlans(d)).toBe(d.kpis.mrr);
  });

  it("still agree once it is suspended", async () => {
    if (skip()) return;
    await setStatus("SUSPENDED");

    const d = await platform();
    expect(sumOfPlans(d), "the parts must add up to the total").toBe(d.kpis.mrr);
  });

  /**
   * The direction that actually cost money on screen: a school that has stopped
   * paying must leave *both* figures, not just the total.
   */
  it("both drop by the suspended school's fee", async () => {
    if (skip()) return;
    await setStatus("ACTIVE");
    const on = await platform();

    await setStatus("SUSPENDED");
    const off = await platform();

    expect(on.kpis.mrr - off.kpis.mrr).toBe(planPrice);
    expect(sumOfPlans(on) - sumOfPlans(off)).toBe(planPrice);
  });

  it("stops counting it against its plan as well", async () => {
    if (skip()) return;
    await setStatus("ACTIVE");
    const on = (await platform()).planDistribution.find((p) => p.id === planId);

    await setStatus("SUSPENDED");
    const off = (await platform()).planDistribution.find((p) => p.id === planId);

    expect(on.institutes - off.institutes).toBe(1);
  });
});
