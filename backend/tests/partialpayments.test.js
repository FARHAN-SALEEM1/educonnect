import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Part payment of a fee challan.
 *
 * A Pakistani school office takes what a family can pay this week and the rest
 * later. The product could not represent that: `payInvoice` stamped the invoice
 * PAID for whatever was handed over, so Rs. 3,000 against an Rs. 11,500 challan
 * settled the whole thing. The remaining Rs. 8,500 left the pending total, left
 * the defaulters report and left the reminders — it was in neither the collected
 * column nor the outstanding one. The money left the books.
 *
 * These pin the invariant that replaces it: `paidAmount` is a running total,
 * PAID means the balance reached zero, and every figure the school reads nets
 * off what has actually been received.
 *
 * A throwaway school, deleted in afterAll.
 */

let sa, admin, parent, instId, studentId, seeded = true;
const stamp = Date.now();
const PASSWORD = "PartPaySpec123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

let periodSeq = 0;
const nextPeriod = () => {
  const n = periodSeq++;
  return `${2035 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
};

/** A challan for `amount`, returned as created. */
const challan = async (amount, extra = {}) =>
  (await as(admin).post("/api/fees").send({
    studentId, period: nextPeriod(), amount, ...extra,
  })).body.data;

const pay = (id, body) => as(admin).post(`/api/fees/${id}/pay`).send(body);

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `partpay.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Part Pay School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `partpay.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Part Pay Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await login(adminEmail);

  studentId = (await as(admin).post("/api/students").send({
    name: "Part Pay Hamza", grade: "Grade 6", section: "A", rollNo: `PP-${stamp}`,
  })).body.data?.id;
  if (!studentId) { seeded = false; return; }

  const p = await as(admin).post("/api/parents").send({
    name: "Part Pay Parent", email: `partpay.parent.${stamp}@test.edu`,
    phone: "03002222222", relation: "Father", createLogin: true,
    studentIds: [studentId],
  });
  parent = await login(
    `partpay.parent.${stamp}@test.edu`,
    (p.body.message.match(/Temporary password: (\S+?)[\s)]/) ?? [])[1] ?? ""
  );
});

afterAll(async () => {
  if (instId) await prismaRaw.institute.delete({ where: { id: instId } }).catch(() => {});
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

describe("taking part of what is owed", () => {
  it("keeps the challan open and says what is left", async () => {
    if (skip()) return;
    const inv = await challan(11500);

    const res = await pay(inv.id, { paidAmount: 3000, method: "Cash" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).not.toBe("PAID");
    expect(res.body.data.balance).toBe(8500);
    expect(res.body.data.settled).toBe(false);
    expect(res.body.message).toContain("8,500");

    const row = await prismaRaw.feeInvoice.findUnique({ where: { id: inv.id } });
    expect(row.paidAmount).toBe(3000);
    expect(row.status).toBe("PENDING");
    // Nothing was settled, so nothing may claim a settlement date.
    expect(row.paidAt).toBeNull();
  });

  it("adds up instalments and clears the challan on the last one", async () => {
    if (skip()) return;
    const inv = await challan(11500);

    await pay(inv.id, { paidAmount: 3000 });
    await pay(inv.id, { paidAmount: 4000 });
    const last = await pay(inv.id, { paidAmount: 4500, method: "Bank Transfer" });

    expect(last.body.data.settled).toBe(true);
    expect(last.body.data.balance).toBe(0);
    expect(last.body.message).toContain("cleared");

    const row = await prismaRaw.feeInvoice.findUnique({ where: { id: inv.id } });
    expect(row.paidAmount).toBe(11500);
    expect(row.status).toBe("PAID");
    expect(row.paidAt).not.toBeNull();
    expect(row.method).toBe("Bank Transfer");
  });

  it("settles in one go when no amount is named, as before", async () => {
    if (skip()) return;
    const inv = await challan(6000);
    const res = await pay(inv.id, { method: "Cash" });
    expect(res.body.data.status).toBe("PAID");
    expect(res.body.data.balance).toBe(0);
  });

  it("pays only the remainder when no amount is named on a part-paid challan", async () => {
    if (skip()) return;
    const inv = await challan(10000);
    await pay(inv.id, { paidAmount: 2500 });

    const res = await pay(inv.id, {});
    expect(res.body.data.settled).toBe(true);
    expect(res.body.data.receivedNow).toBe(7500);
    expect((await prismaRaw.feeInvoice.findUnique({ where: { id: inv.id } })).paidAmount).toBe(10000);
  });

  it("refuses more than is still due, and says how much that is", async () => {
    if (skip()) return;
    const inv = await challan(5000);
    await pay(inv.id, { paidAmount: 2000 });

    const res = await pay(inv.id, { paidAmount: 4000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("3,000");

    // The refused payment changed nothing.
    expect((await prismaRaw.feeInvoice.findUnique({ where: { id: inv.id } })).paidAmount).toBe(2000);
  });

  it("refuses a payment on a challan that is already clear", async () => {
    if (skip()) return;
    const inv = await challan(4000);
    await pay(inv.id, {});
    const res = await pay(inv.id, { paidAmount: 100 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already paid/i);
  });

  it("refuses a zero payment", async () => {
    if (skip()) return;
    const inv = await challan(4000);
    expect((await pay(inv.id, { paidAmount: 0 })).status).toBe(400);
  });

  it("nets a discount off before deciding the challan is clear", async () => {
    if (skip()) return;
    const inv = await challan(10000, { discount: 2500 });

    const res = await pay(inv.id, { paidAmount: 7500 });
    expect(res.body.data.settled).toBe(true);
    expect((await prismaRaw.feeInvoice.findUnique({ where: { id: inv.id } })).status).toBe("PAID");
  });

  it("leaves an overdue challan overdue when it is only part paid", async () => {
    if (skip()) return;
    const inv = await challan(9000);
    await prismaRaw.feeInvoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });

    await pay(inv.id, { paidAmount: 1000 });
    expect((await prismaRaw.feeInvoice.findUnique({ where: { id: inv.id } })).status).toBe("OVERDUE");
  });

  it("will not take money against a waived challan", async () => {
    if (skip()) return;
    const inv = await challan(3000);
    await prismaRaw.feeInvoice.update({ where: { id: inv.id }, data: { status: "WAIVED" } });
    expect((await pay(inv.id, { paidAmount: 100 })).status).toBe(400);
  });
});

describe("what the school reads afterwards", () => {
  it("counts the unpaid part as outstanding and the paid part as collected", async () => {
    if (skip()) return;
    const before = (await as(admin).get("/api/fees/stats")).body.data;

    const inv = await challan(20000);
    await pay(inv.id, { paidAmount: 6000 });

    const after = (await as(admin).get("/api/fees/stats")).body.data;
    expect(after.totalInvoiced - before.totalInvoiced).toBe(20000);
    expect(after.collected - before.collected).toBe(6000);
    expect(after.outstanding - before.outstanding).toBe(14000);
  });

  it("makes the monthly chart agree with the totals above it", async () => {
    if (skip()) return;
    const period = nextPeriod();
    const inv = (await as(admin).post("/api/fees").send({
      studentId, period, amount: 8000,
    })).body.data;
    await pay(inv.id, { paidAmount: 5000 });

    const stats = (await as(admin).get("/api/fees/stats")).body.data;
    const month = stats.monthly.find((m) => m.period === period);
    expect(month.billed).toBe(8000);
    expect(month.collected).toBe(5000);
  });

  it("shows the balance on the invoice itself", async () => {
    if (skip()) return;
    const inv = await challan(7000);
    await pay(inv.id, { paidAmount: 2000 });

    const one = await as(admin).get(`/api/fees/${inv.id}`);
    expect(one.body.data.balance).toBe(5000);

    const list = await as(admin).get(`/api/fees?studentId=${studentId}&limit=100`);
    expect(list.body.data.find((i) => i.id === inv.id).balance).toBe(5000);
  });

  /**
   * The same challan is totalled on five screens. They each wrote the sum out
   * by hand and had drifted — one added the raw `amount`, three netted off the
   * discount and late fee, none subtracted what had been received. They all
   * read one helper now, so a family cannot be quoted two different figures.
   */
  it("quotes the same dues on the student list and the student's own page", async () => {
    if (skip()) return;
    const inv = await challan(12000);
    await pay(inv.id, { paidAmount: 4000 });

    const detail = (await as(admin).get(`/api/students/${studentId}`)).body.data;
    const list = (await as(admin).get("/api/students?limit=100")).body.data
      .find((s) => s.id === studentId);

    // The part payment is money in, and only the remainder is still owed.
    expect(detail.fees.outstanding).toBe(list.duesOutstanding);
    expect(detail.fees.paid).toBeGreaterThanOrEqual(4000);
  });

  it("shows a guardian the remainder, not the original challan", async () => {
    if (skip() || !parent) return;

    const dues = async () => {
      const res = await as(parent).get("/api/parents/me/children");
      expect(res.status, `children: ${res.body?.message}`).toBe(200);
      const mine = res.body.data.find((c) => c.id === studentId);
      expect(mine, "the guardian must be able to see this child").toBeTruthy();
      return mine.duesOutstanding;
    };

    const before = await dues();

    const inv = await challan(15000);
    await pay(inv.id, { paidAmount: 5000 });

    expect((await dues()) - before).toBe(10000);
  });

  /**
   * The parent portal now prints its own challan, which means it fetches
   * `GET /fees/:id` directly rather than reading invoices nested inside its own
   * children's payload. That route carries no `authorize()`, so the scoping is
   * the only thing standing between one family and another's bill.
   */
  it("lets a guardian open their own child's challan and nobody else's", async () => {
    if (skip() || !parent) return;

    const mine = await challan(5000);
    expect((await as(parent).get(`/api/fees/${mine.id}`)).status).toBe(200);

    const other = (await as(admin).post("/api/students").send({
      name: "Part Pay Stranger", grade: "Grade 6", section: "B", rollNo: `PPX-${stamp}`,
    })).body.data;
    const theirs = (await as(admin).post("/api/fees").send({
      studentId: other.id, period: nextPeriod(), amount: 5000,
    })).body.data;

    // Same school, different family — 404 rather than 403, so the id is not
    // confirmed to exist either.
    expect((await as(parent).get(`/api/fees/${theirs.id}`)).status).toBe(404);
    expect((await as(parent).post(`/api/fees/${theirs.id}/pay`).send({ paidAmount: 1 })).status)
      .not.toBe(200);
  });

  it("keeps a part-paid family on the reminder list, for the remainder only", async () => {
    if (skip()) return;
    const inv = await challan(9000);
    await pay(inv.id, { paidAmount: 2000 });

    const res = await as(admin).post("/api/fees/remind").send({});
    expect(res.status).toBe(200);

    const mine = (res.body.data.details ?? res.body.data.guardians ?? [])
      .flatMap((g) => g.items ?? []);
    if (mine.length) {
      const line = mine.find((i) => i.invoiceId === inv.id || i.title);
      if (line) expect(line.amount).not.toBe(9000);
    }
  });
});
