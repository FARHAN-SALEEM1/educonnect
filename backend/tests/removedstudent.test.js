import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * A removed student is out of the school, and out of its reporting.
 *
 * Soft delete is applied by a Prisma extension, and the extension only rewrites
 * the **top-level** `where` of a soft-deletable model. Most of `studentScopeWhere`
 * is used as a *nested* filter instead —
 *
 *     prisma.attendance.findMany({ where: { student: scope } })
 *
 * — and `Attendance` is not soft-deletable, so nothing ever added `deletedAt`.
 * A student who had left kept counting: their absences stayed in the school's
 * attendance rate for good, while the student list they had vanished from
 * disagreed with it. Measured on a throwaway school before the fix:
 *
 *     before delete   students 2, attendance total 2, absent 1
 *     after delete    students 1, attendance total 2, absent 1
 *
 * The restore path is the other half of this: a student who comes back must
 * bring their record with them, so nothing may be erased on the way out.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "RemovedSpec123";

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

const TZ = "Asia/Karachi";
const dayIn = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86_400_000));

let sa, admin, instId, stays, leaves;
let seeded = true;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `removed.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Removed School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `removed.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "Removed Admin",
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

  const make = async (name, roll) =>
    (
      await as(admin).post("/api/students").send({
        name,
        grade: "Grade 8",
        section: "A",
        rollNo: roll,
      })
    ).body.data;

  stays = await make("Aliya Stays", `RM-S-${stamp}`);
  leaves = await make("Bilal Leaves", `RM-L-${stamp}`);
  if (!stays || !leaves) {
    seeded = false;
    return;
  }

  // One register both children are on, and a challan each.
  await as(admin)
    .post("/api/attendance/bulk")
    .send({
      date: dayIn(-1),
      records: [
        { studentId: stays.id, status: "PRESENT" },
        { studentId: leaves.id, status: "ABSENT" },
      ],
    });
  for (const s of [stays, leaves]) {
    await as(admin)
      .post("/api/fees")
      .send({ studentId: s.id, period: "2026-05", amount: 5000 });
  }

  // And then one of them leaves.
  const removed = await as(admin).delete(`/api/students/${leaves.id}`);
  if (removed.status !== 200) seeded = false;
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

describe("a student who has left the school", () => {
  it("is gone from the student list", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/students?limit=100");

    const names = (res.body.data ?? []).map((s) => s.name);
    expect(names).toContain("Aliya Stays");
    expect(names).not.toContain("Bilal Leaves");
  });

  it("no longer counts towards the school's attendance", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/attendance/summary");

    // One register, one child still enrolled — and their absence went with them.
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.absent).toBe(0);
  });

  it("is gone from the attendance list too, not just the totals", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/attendance?limit=100");

    const ids = (res.body.data ?? []).map((r) => r.studentId ?? r.student?.id);
    expect(ids).not.toContain(leaves.id);
  });

  it("takes their challan out of the fee list", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/fees?limit=100");

    const ids = (res.body.data ?? []).map((f) => f.studentId ?? f.student?.id);
    expect(ids).toContain(stays.id);
    expect(ids).not.toContain(leaves.id);
  });
});

/**
 * Removing a student hides their record; it must never destroy it. The recycle
 * bin promises the row can come back, and a restore that returned a child with
 * no attendance and no fee history would be a worse bug than the one above.
 */
describe("the record itself survives", () => {
  it("keeps the rows in the database, ready for a restore", async () => {
    if (skip()) return;
    expect(await prismaRaw.attendance.count({ where: { studentId: leaves.id } })).toBe(1);
    expect(await prismaRaw.feeInvoice.count({ where: { studentId: leaves.id } })).toBe(1);
  });

  it("brings them back with their history when restored", async () => {
    if (skip()) return;
    const res = await as(admin).post(`/api/students/${leaves.id}/restore`);
    expect(res.status, res.body.message).toBe(200);

    const summary = await as(admin).get("/api/attendance/summary");
    expect(summary.body.data.total).toBe(2);
    expect(summary.body.data.absent).toBe(1);

    // Put it back, so the assertions above do not depend on execution order.
    await as(admin).delete(`/api/students/${leaves.id}`);
  });
});

/**
 * The totals have to agree with the list they summarise.
 *
 * Scoping the list without scoping the aggregates would trade one bug for a
 * worse one: a fee screen showing one challan above a total that counts two,
 * with nothing on the page explaining the difference. `feeStats` and the admin
 * dashboard group invoices for the whole institute and never mention the
 * student, so the filter has to be added to them by hand.
 */
describe("the fee totals agree with the fee list", () => {
  it("leaves a departed student's challan out of the stats", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/fees/stats");

    const pending = res.body.data?.pending ?? res.body.data?.outstanding;
    expect(pending).toBe(5000);
  });

  it("leaves it out of the admin dashboard too", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/dashboard/admin");

    expect(res.body.data?.fees?.pending).toBe(5000);
  });
});
