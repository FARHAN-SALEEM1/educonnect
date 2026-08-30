import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Fee heads — what a challan is actually made of.
 *
 * A Pakistani challan carries several charges on one slip: tuition for the
 * month, transport, the exam fee when exams fall in that month, annual charges
 * in April. Before this the product had one `amount` and a free-text title, so
 * a parent seeing Rs. 11,500 instead of Rs. 8,000 had nothing to read and the
 * office had nothing to point at.
 *
 * The invariant these pin down: `FeeInvoice.amount` stays the authoritative
 * total, and equals the sum of the lines whenever lines exist. Everything
 * downstream — stats, reminders, the defaulters report — reads `amount` and
 * needs to know nothing about heads. Invoices raised before heads have none and
 * go on working, which is the other half of what is tested here.
 *
 * Two throwaway schools, deleted in afterAll. The demo institutes and their
 * real invoices are never written to.
 */

let sa, admin, other, instId, otherId, studentId, otherStudentId;
let seeded = true;
const stamp = Date.now();
const PASSWORD = "FeeHeadSpec123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});

const school = async (label) => {
  const adminEmail = `${label}.admin.${stamp}@test.edu`;
  const res = await request(app).post("/api/auth/signup").send({
    name: `Fee Head ${label} ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `${label}.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Fee Head Admin", adminEmail, adminPassword: PASSWORD,
  });
  const id = res.body.data?.institute?.id;
  if (!id) return {};
  await as(sa).patch(`/api/institutes/${id}/status`).send({ status: "ACTIVE" });
  return { id, token: await login(adminEmail) };
};

/**
 * A month nobody else in this spec is billing. `@@unique([studentId, period])`
 * means every case needs its own month, and there are more cases than there are
 * months in a year — so the year rolls over too.
 */
let periodSeq = 0;
const nextPeriod = () => {
  const n = periodSeq++;
  return `${2031 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
};

const TUITION_AND_BUS = [
  { head: "TUITION", amount: 8000 },
  { head: "TRANSPORT", label: "Route 3", amount: 2500 },
  { head: "EXAMINATION", amount: 1000 },
];

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const a = await school("main");
  const b = await school("other");
  if (!a.id || !b.id) { seeded = false; return; }
  ({ id: instId, token: admin } = a);
  ({ id: otherId, token: other } = b);

  studentId = (await as(admin).post("/api/students").send({
    name: "Fee Head Ali", grade: "Grade 5", section: "A", rollNo: `FH-1-${stamp}`,
  })).body.data?.id;
  otherStudentId = (await as(other).post("/api/students").send({
    name: "Fee Head Rival", grade: "Grade 5", section: "A", rollNo: `FH-2-${stamp}`,
  })).body.data?.id;
  if (!studentId || !otherStudentId) seeded = false;
});

afterAll(async () => {
  for (const id of [instId, otherId]) {
    if (id) await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  }
  await prismaRaw.user.deleteMany({ where: { email: { contains: `.${stamp}@test.edu` } } }).catch(() => {});
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

/** Raise an itemised challan and hand back the created invoice. */
const itemised = async (items = TUITION_AND_BUS) =>
  (await as(admin).post("/api/fees").send({ studentId, period: nextPeriod(), items })).body.data;

describe("raising an itemised challan", () => {
  it("totals the heads instead of asking for the total twice", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/fees").send({
      studentId, period: nextPeriod(), items: TUITION_AND_BUS,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(11500);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.items.map((i) => i.head)).toEqual(["TUITION", "TRANSPORT", "EXAMINATION"]);
    expect(res.body.data.items[1].label).toBe("Route 3");
  });

  it("ignores an amount typed alongside the heads rather than storing a disagreement", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/fees").send({
      studentId, period: nextPeriod(), amount: 999, items: TUITION_AND_BUS,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(11500);
  });

  it("still accepts a plain single-amount challan, with no heads", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/fees").send({
      studentId, period: nextPeriod(), amount: 6000,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(6000);
    expect(res.body.data.items ?? []).toHaveLength(0);
  });

  it("refuses a challan that says neither a total nor what it is for", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/fees").send({ studentId, period: nextPeriod() });
    expect(res.status).toBe(400);
  });

  it("refuses a head the school does not bill under", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/fees").send({
      studentId, period: nextPeriod(), items: [{ head: "BRIBE", amount: 5000 }],
    });
    expect(res.status).toBe(422);
  });

  it("refuses a negative line", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/fees").send({
      studentId, period: nextPeriod(), items: [{ head: "TUITION", amount: -500 }],
    });
    expect(res.status).toBe(422);
  });
});

describe("reading a challan back", () => {
  it("carries its breakdown in the list and on its own page", async () => {
    if (skip()) return;
    const created = await itemised();

    const list = await as(admin).get(`/api/fees?studentId=${studentId}&limit=100`);
    const found = list.body.data.find((i) => i.id === created.id);
    expect(found.items).toHaveLength(3);

    const one = await as(admin).get(`/api/fees/${created.id}`);
    expect(one.body.data.items.map((i) => i.amount)).toEqual([8000, 2500, 1000]);
  });

  it("is counted by its total, so the stats know nothing about heads", async () => {
    if (skip()) return;
    const before = (await as(admin).get("/api/fees/stats")).body.data;
    await itemised();
    const after = (await as(admin).get("/api/fees/stats")).body.data;

    expect(after.pending - before.pending).toBe(11500);
  });

  it("does not leak to another school's admin", async () => {
    if (skip()) return;
    const created = await itemised();
    expect((await as(other).get(`/api/fees/${created.id}`)).status).toBe(404);
    expect((await as(other).patch(`/api/fees/${created.id}`).send({ amount: 1 })).status).toBe(404);
  });
});

describe("correcting a challan", () => {
  it("replaces the whole breakdown and re-totals", async () => {
    if (skip()) return;
    const created = await itemised();

    const res = await as(admin).patch(`/api/fees/${created.id}`).send({
      items: [{ head: "TUITION", amount: 8000 }, { head: "ANNUAL", amount: 5000 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(13000);
    expect(res.body.data.items.map((i) => i.head)).toEqual(["TUITION", "ANNUAL"]);
    expect(await prismaRaw.feeItem.count({ where: { invoiceId: created.id } })).toBe(2);
  });

  it("drops back to a plain challan when the breakdown is emptied", async () => {
    if (skip()) return;
    const created = await itemised();

    const res = await as(admin).patch(`/api/fees/${created.id}`).send({ items: [], amount: 4000 });
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(4000);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("will not let the total drift away from the heads it is made of", async () => {
    if (skip()) return;
    const created = await itemised();

    const res = await as(admin).patch(`/api/fees/${created.id}`).send({ amount: 50 });
    expect(res.status).toBe(400);

    const still = await as(admin).get(`/api/fees/${created.id}`);
    expect(still.body.data.amount).toBe(11500);
  });

  it("edits a plain challan's amount as before", async () => {
    if (skip()) return;
    const created = (await as(admin).post("/api/fees").send({
      studentId, period: nextPeriod(), amount: 6000,
    })).body.data;

    const res = await as(admin).patch(`/api/fees/${created.id}`).send({ amount: 7000 });
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(7000);
  });

  /**
   * PATCH /fees/:id had no schema: the body was spread into a Prisma update, so
   * a nested relation write could re-point the invoice at a student the caller
   * has no business touching. `instituteId` was stripped from the body;
   * `student` was not, and scoping never looks at the body.
   */
  it("cannot be re-pointed at another school's student through a nested write", async () => {
    if (skip()) return;
    const created = await itemised();

    const res = await as(admin).patch(`/api/fees/${created.id}`).send({
      student: { connect: { id: otherStudentId } },
    });

    expect([200, 422]).toContain(res.status);
    const row = await prismaRaw.feeInvoice.findUnique({
      where: { id: created.id }, select: { studentId: true, instituteId: true },
    });
    expect(row.studentId).toBe(studentId);
    expect(row.instituteId).toBe(instId);
  });

  it("takes its lines with it when the challan is deleted", async () => {
    if (skip()) return;
    const created = await itemised();
    expect((await as(admin).delete(`/api/fees/${created.id}`)).status).toBe(200);
    expect(await prismaRaw.feeItem.count({ where: { invoiceId: created.id } })).toBe(0);
  });
});

describe("the monthly billing run", () => {
  it("gives every invoice the month's standard breakdown", async () => {
    if (skip()) return;
    const period = nextPeriod();
    const res = await as(admin).post("/api/fees/generate").send({ period, items: TUITION_AND_BUS });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.totalBilled).toBe(11500);

    const list = await as(admin).get(`/api/fees?period=${period}&limit=100`);
    expect(list.body.data[0].amount).toBe(11500);
    expect(list.body.data[0].items).toHaveLength(3);
  });

  it("does not re-itemise a challan that was already issued", async () => {
    if (skip()) return;
    const period = nextPeriod();
    await as(admin).post("/api/fees/generate").send({ period, items: TUITION_AND_BUS });

    const again = await as(admin).post("/api/fees/generate").send({ period, items: TUITION_AND_BUS });
    expect(again.body.data.created).toBe(0);

    const invoice = (await as(admin).get(`/api/fees?period=${period}&limit=100`)).body.data[0];
    expect(invoice.items).toHaveLength(3);
    expect(invoice.amount).toBe(11500);
  });

  it("bills a flat amount when no breakdown is given", async () => {
    if (skip()) return;
    const period = nextPeriod();
    const res = await as(admin).post("/api/fees/generate").send({ period, amount: 5000 });
    expect(res.body.data.totalBilled).toBe(5000);

    const invoice = (await as(admin).get(`/api/fees?period=${period}&limit=100`)).body.data[0];
    expect(invoice.items ?? []).toHaveLength(0);
  });

  it("refuses a head it does not know, before writing anything", async () => {
    if (skip()) return;
    const period = nextPeriod();
    const res = await as(admin).post("/api/fees/generate").send({
      period, items: [{ head: "DONATION", amount: 1000 }],
    });
    expect(res.status).toBe(422);
    expect(await prismaRaw.feeInvoice.count({ where: { instituteId: instId, period } })).toBe(0);
  });
});
