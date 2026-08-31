import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * A fee is not late on the day it is due.
 *
 * `markOverdue` asked for invoices whose `dueDate` was `lt: new Date()`, and a
 * due date is stored at midnight — so a challan due on the 10th flipped to
 * OVERDUE at 00:00 on the 10th. Before the office opened, on the day the money
 * was actually due, the family was a defaulter: on the defaulters report, in
 * the reminder run, and charged whatever late fee the run carried.
 *
 * The second half is quieter. Due dates were built with
 * `new Date(year, month - 1, day)`, which is midnight in the *server's* zone,
 * while every other date in the product is UTC midnight of the calendar day.
 * The same billing run therefore produced a different stored instant depending
 * on where it ran, and on a host east of UTC it landed on the previous day —
 * making the challan a day late the moment it was issued.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "OverdueSpec123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

/** The school's own calendar date, which is what "due today" has to mean. */
const TZ = "Asia/Karachi";
const dayIn = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86_400_000));

let sa, admin, instId, student;
let seeded = true;

/** Issues a challan for a distinct period, so nothing collides. */
let periodSeq = 0;
const issue = async (dueDate) => {
  const period = `2026-0${++periodSeq}`;
  const res = await as(admin)
    .post("/api/fees")
    .send({ studentId: student.id, period, amount: 5000, dueDate });
  return res.body.data;
};

const statusOf = async (id) =>
  (await prismaRaw.feeInvoice.findUnique({ where: { id }, select: { status: true } }))?.status;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `overdue.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Overdue School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `overdue.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "Overdue Admin",
    adminEmail,
    adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) {
    seeded = false;
    return;
  }
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await login(adminEmail);

  student = (
    await as(admin).post("/api/students").send({
      name: "Overdue Student",
      grade: "Grade 8",
      section: "A",
      rollNo: `OD-${stamp}`,
    })
  ).body.data;
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

describe("marking invoices overdue", () => {
  it("leaves a challan due today alone", async () => {
    if (skip()) return;
    const invoice = await issue(dayIn(0));

    const res = await as(admin).post("/api/fees/mark-overdue").send({});
    expect(res.status).toBe(200);

    expect(await statusOf(invoice.id), "the fee is due today, not late").toBe("PENDING");
  });

  it("marks one whose day has passed", async () => {
    if (skip()) return;
    const invoice = await issue(dayIn(-1));

    await as(admin).post("/api/fees/mark-overdue").send({});

    expect(await statusOf(invoice.id)).toBe("OVERDUE");
  });

  it("leaves one due later alone", async () => {
    if (skip()) return;
    const invoice = await issue(dayIn(7));

    await as(admin).post("/api/fees/mark-overdue").send({});

    expect(await statusOf(invoice.id)).toBe("PENDING");
  });

  /**
   * The late fee rides along with the status change, so charging it a day
   * early is the part that reaches the parent as money rather than a label.
   */
  it("does not charge the late fee a day early either", async () => {
    if (skip()) return;
    const invoice = await issue(dayIn(0));

    await as(admin).post("/api/fees/mark-overdue").send({ lateFee: 500 });

    const row = await prismaRaw.feeInvoice.findUnique({
      where: { id: invoice.id },
      select: { status: true, lateFee: true },
    });
    expect(row.status).toBe("PENDING");
    expect(row.lateFee ?? 0).toBe(0);
  });
});

describe("the due date a billing run writes", () => {
  it("is UTC midnight of the calendar day, not the server's midnight", async () => {
    if (skip()) return;
    const res = await as(admin)
      .post("/api/fees/generate")
      .send({ period: "2026-11", amount: 7500, dueDay: 10 });
    expect(res.status, res.body.message).toBe(201);

    const invoice = await prismaRaw.feeInvoice.findFirst({
      where: { instituteId: instId, period: "2026-11" },
      select: { dueDate: true },
    });
    // Not "the 10th at whatever o'clock the host happens to call midnight".
    expect(invoice.dueDate.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });
});

/**
 * A defaulter's row said "Paid".
 *
 * The roster badge asked `fees.some(f => f.status === "pending")`, and the list
 * endpoint carried twelve full invoices per student so it could. Both halves
 * were wrong. An OVERDUE challan is not "pending", so the one family the office
 * most needs to see read as settled — the failure pointed the safe way, which is
 * why nobody noticed. And the answer was already on the row: the server totals
 * PENDING + OVERDUE balances into `duesOutstanding` from its own lean query.
 *
 * Sending the invoices was costing 1.2 KB per student — on a 1,200-student
 * school, 1.4 MB per portal load to render a two-word badge.
 */
describe("what the roster needs to badge a fee", () => {
  it("counts an overdue challan as money owed", async () => {
    if (skip()) return;
    const invoice = await issue(dayIn(-1));
    await as(admin).post("/api/fees/mark-overdue").send({});
    expect(await statusOf(invoice.id)).toBe("OVERDUE");

    const row = (await as(admin).get("/api/students?limit=50")).body.data.find(
      (s) => s.id === student.id
    );

    expect(row.duesOutstanding, "an overdue fee is still unpaid").toBeGreaterThan(0);
  });

  it("does not ship the invoices themselves to say it", async () => {
    if (skip()) return;
    const row = (await as(admin).get("/api/students?limit=50")).body.data.find(
      (s) => s.id === student.id
    );

    expect(row.fees, "twelve invoices per student, for one badge").toBeUndefined();
    expect(row.weekAttendance, "built, sent, and read by nobody").toBeUndefined();
  });
});
