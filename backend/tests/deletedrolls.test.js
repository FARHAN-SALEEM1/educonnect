import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * A roll number held by a child in the recycle bin.
 *
 * `@@unique([instituteId, rollNo])` is enforced on the table, and a soft delete
 * leaves the row there — so a removed student keeps their roll number for good.
 * That is the right call: restoring them has to put back exactly what was taken
 * away. What was wrong was how the product said so.
 *
 * The import checks roll numbers against `prisma.student.findMany`, which the
 * soft-delete extension filters, so a roll belonging to a removed child looked
 * free. The row passed validation, the insert then hit the constraint, and the
 * whole file failed on a message assembled from column names —
 *
 *     A record with this instituteId, rollNo already exists
 *
 * — which names no row, no child, and nowhere to look. The student is in the
 * recycle bin, which is the one place the admin has no reason to check, because
 * as far as every listing is concerned that roll number is not in use.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "DeletedRolls123";

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

const TAKEN = `DR-TAKEN-${stamp}`;

let sa, admin, instId, removed;
let seeded = true;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `dr.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Deleted Rolls School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `dr.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "DR Admin",
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

  const made = await as(admin).post("/api/students").send({
    name: "Gone But Numbered",
    grade: "Grade 8",
    section: "A",
    rollNo: TAKEN,
  });
  removed = made.body.data;
  if (!removed) {
    seeded = false;
    return;
  }
  const del = await as(admin).delete(`/api/students/${removed.id}`);
  if (del.status !== 200) seeded = false;
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

describe("the roll number is genuinely still taken", () => {
  it("is invisible in every listing", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/students?limit=100");
    const rolls = (res.body.data ?? []).map((s) => s.rollNo);

    expect(rolls).not.toContain(TAKEN);
  });

  it("is still on the row, so a restore can bring it back", async () => {
    if (skip()) return;
    const row = await prismaRaw.student.findUnique({
      where: { id: removed.id },
      select: { rollNo: true, deletedAt: true },
    });

    expect(row.rollNo).toBe(TAKEN);
    expect(row.deletedAt).not.toBeNull();
  });
});

describe("reusing it through the student form", () => {
  it("is refused in a way that names the recycle bin", async () => {
    if (skip()) return;
    const res = await as(admin).post("/api/students").send({
      name: "New Child",
      grade: "Grade 8",
      section: "A",
      rollNo: TAKEN,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain(TAKEN);
    expect(res.body.message).toMatch(/recycle bin|removed student/i);
    // And never the column names.
    expect(res.body.message).not.toMatch(/instituteId|rollNo/);
  });
});

describe("reusing it through the CSV import", () => {
  it("is caught per row, before anything is written", async () => {
    if (skip()) return;
    const res = await request(app)
      .post("/api/students/import")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        rows: [
          { name: "Fine One", grade: "Grade 8", section: "A", rollNo: `DR-OK-${stamp}` },
          { name: "Clashing One", grade: "Grade 8", section: "A", rollNo: TAKEN },
        ],
      });

    expect(res.status).toBe(422);
    const problems = (res.body.errors ?? []).flatMap((e) => e.problems ?? []);
    expect(problems.join(" ")).toMatch(/recycle bin|removed student/i);
    // The row is named, which the raw database error never did.
    expect((res.body.errors ?? []).some((e) => e.name === "Clashing One")).toBe(true);
  });

  it("writes nothing at all, including the row that was fine", async () => {
    if (skip()) return;
    const res = await as(admin).get("/api/students?limit=100");
    const names = (res.body.data ?? []).map((s) => s.name);

    expect(names).not.toContain("Fine One");
  });
});
