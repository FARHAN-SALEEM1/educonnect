import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * CSV bulk import — phone validation.
 *
 * The import schema keeps every cell a loose string so one bad value can't
 * reject a whole file with an opaque `rows.47.phone` path; the controller
 * collects problems per row instead. Phone numbers were missed by that
 * per-row pass entirely, so the bulk path accepted numbers the single-record
 * endpoints refuse. These tests pin the two phone columns to the shared rule.
 *
 * Nothing is ever written: every batch here contains at least one bad row and
 * `partial` is left at its default of false, which makes the import
 * all-or-nothing and rolls the whole request back with a 422.
 */

let admin, seeded = true;

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};

/** A row that is valid apart from whatever the test overrides. */
const row = (over = {}) => ({
  name: "Import Probe",
  grade: "Grade 8",
  section: "A",
  rollNo: `IMPORT-PROBE-${Math.random().toString(36).slice(2, 10)}`,
  ...over,
});

const send = (rows) =>
  request(app)
    .post("/api/students/import")
    .set("Authorization", `Bearer ${admin}`)
    .send({ rows });

/** All problem strings the API reported, flattened. */
const problemsFrom = (res) =>
  (res.body.errors ?? []).flatMap((e) => e.problems ?? []);

beforeAll(async () => {
  admin = await login("admin@bhs.edu", "admin123");
  if (!admin) seeded = false;
});

const skip = () => !seeded;

describe("CSV import — student phone column", () => {
  it("rejects a landline, a +92 number and a wrong length", async () => {
    if (skip()) return;
    for (const bad of ["04235761234", "+923001234567", "0300123456", "0300-1234567"]) {
      const res = await send([row({ phone: bad })]);
      expect(res.status, `${bad} should be rejected`).toBe(422);
      const problems = problemsFrom(res);
      expect(
        problems.some((p) => p.startsWith("phone —")),
        `${bad} should produce a phone problem, got ${JSON.stringify(problems)}`
      ).toBe(true);
    }
  });

  it("explains why, rather than just failing", async () => {
    if (skip()) return;
    const res = await send([row({ phone: "04235761234" })]);
    const problems = problemsFrom(res);
    expect(problems.join(" ")).toMatch(/must start with 03/i);
  });

  it("reports the offending line number", async () => {
    if (skip()) return;
    // Row 1 is fine, row 2 is bad. Line numbers are 1-based plus a header row,
    // so the second data row is line 3.
    const res = await send([row(), row({ phone: "04235761234" })]);
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].line).toBe(3);
  });
});

describe("CSV import — guardianPhone column", () => {
  it("is validated too, and named separately", async () => {
    if (skip()) return;
    const res = await send([
      row({ guardianEmail: "probe.guardian@example.com", guardianPhone: "0213456789" }),
    ]);
    expect(res.status).toBe(422);
    const problems = problemsFrom(res);
    expect(
      problems.some((p) => p.startsWith("guardianPhone —")),
      `expected a guardianPhone problem, got ${JSON.stringify(problems)}`
    ).toBe(true);
  });

  it("keeps the two phone columns independent", async () => {
    if (skip()) return;
    const res = await send([
      row({
        phone: "04235761234",
        guardianEmail: "probe.guardian@example.com",
        guardianPhone: "0213456789",
      }),
    ]);
    const problems = problemsFrom(res);
    expect(problems.some((p) => p.startsWith("phone —"))).toBe(true);
    expect(problems.some((p) => p.startsWith("guardianPhone —"))).toBe(true);
  });
});

describe("CSV import — guardianEmail column", () => {
  it("rejects what the rest of the API rejects", async () => {
    if (skip()) return;
    // Each of these passes the old loose /^[^@\s]+@[^@\s]+\.[^@\s]+$/ check but
    // is refused by every single-record endpoint.
    for (const bad of [
      "a..b@example.com", // consecutive dots
      ".lead@example.com", // leading dot
      "trail.@example.com", // trailing dot before the @
    ]) {
      const res = await send([row({ guardianEmail: bad })]);
      expect(res.status, `${bad} should be rejected`).toBe(422);
      const problems = problemsFrom(res);
      expect(
        problems.some((p) => p.startsWith("guardianEmail —")),
        `${bad} should produce a guardianEmail problem, got ${JSON.stringify(problems)}`
      ).toBe(true);
    }
  });

  it("still rejects the obviously malformed", async () => {
    if (skip()) return;
    for (const bad of ["notanemail", "test@gmail", "a@b", "no space@example.com"]) {
      const res = await send([row({ guardianEmail: bad })]);
      expect(res.status, `${bad} should be rejected`).toBe(422);
      expect(problemsFrom(res).some((p) => p.startsWith("guardianEmail —"))).toBe(true);
    }
  });

  it("explains the problem rather than saying only that it is invalid", async () => {
    if (skip()) return;
    const res = await send([row({ guardianEmail: "a..b@example.com" })]);
    expect(problemsFrom(res).join(" ")).toMatch(/two dots in a row/i);
  });

  it("accepts a valid address and leaves it out of the errors", async () => {
    if (skip()) return;
    const res = await send([
      row({ guardianEmail: "real.guardian@example.co.uk" }),
      row({ rollNo: "" }), // fails the batch so nothing is written
    ]);
    expect(res.status).toBe(422);
    expect(problemsFrom(res).some((p) => p.includes("guardianEmail"))).toBe(false);
  });
});

describe("CSV import — phone stays optional", () => {
  it("does not complain about a blank, missing or whitespace-only phone", async () => {
    if (skip()) return;
    // The batch still fails on the deliberately bad row, which is what keeps
    // this test from writing anything — but none of the failures may be about
    // the phone columns of the rows above it.
    const res = await send([
      row(),
      row({ phone: "" }),
      row({ phone: "   " }),
      row({ guardianEmail: "probe.guardian@example.com", guardianPhone: "" }),
      row({ rollNo: "" }), // the row that fails the batch
    ]);
    expect(res.status).toBe(422);
    const problems = problemsFrom(res);
    expect(problems.some((p) => p.includes("phone"))).toBe(false);
    expect(problems.some((p) => p.includes("rollNo is required"))).toBe(true);
  });

  it("accepts a valid mobile, and tolerates surrounding whitespace", async () => {
    if (skip()) return;
    const res = await send([
      row({ phone: "03001234567" }),
      row({ phone: "  03451234567  " }),
      row({ rollNo: "" }), // fails the batch so nothing is written
    ]);
    expect(res.status).toBe(422);
    const problems = problemsFrom(res);
    expect(
      problems.some((p) => p.includes("phone")),
      `valid numbers should not be flagged, got ${JSON.stringify(problems)}`
    ).toBe(false);
  });
});

/**
 * The only block here that writes. `emailField` lowercases, and the guardian
 * lookup matches on `email`, which Postgres compares case-sensitively — so
 * siblings listed with differently-cased guardian addresses used to produce a
 * separate parent each. Everything created is removed in afterAll.
 */
describe("CSV import — guardian dedup is case-insensitive", () => {
  const ROLLS = ["CASEFOLD-1", "CASEFOLD-2"];
  const EMAIL = "casefold.guardian@example.com";

  /**
   * Deliberately broader than the happy path needs. If a regression ever lets
   * the other blocks write — they only stay read-only because their batches
   * are rejected — this still sweeps up after them, and it matches the
   * guardian address case-insensitively so an unnormalised row can't survive
   * a cleanup that looked only for the lowercase form. Sweeping every
   * `example.c*` guardian is safe: that domain is reserved by RFC 2606 and
   * can never belong to a real school.
   */
  afterAll(async () => {
    if (skip()) return;
    const kids = await prismaRaw.student.findMany({
      where: { OR: [{ rollNo: { in: ROLLS } }, { name: "Import Probe" }] },
      select: { id: true },
    });
    const ids = kids.map((k) => k.id);
    for (const model of ["attendance", "feeInvoice", "enrollment", "aIInsight"]) {
      if (prismaRaw[model]) {
        try {
          await prismaRaw[model].deleteMany({ where: { studentId: { in: ids } } });
        } catch {
          /* model may not relate to students; nothing to clean */
        }
      }
    }
    await prismaRaw.student.deleteMany({ where: { id: { in: ids } } });
    await prismaRaw.parent.deleteMany({
      where: { email: { contains: "example.c", mode: "insensitive" } },
    });
  });

  it("creates one guardian for siblings whose rows differ only in casing", async () => {
    if (skip()) return;
    const res = await send([
      { name: "Casefold One", grade: "Grade 8", section: "A", rollNo: ROLLS[0], guardianEmail: EMAIL },
      {
        name: "Casefold Two",
        grade: "Grade 8",
        section: "A",
        rollNo: ROLLS[1],
        guardianEmail: EMAIL.toUpperCase(),
      },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.parentsCreated).toBe(1);

    // And it is stored lowercased, the same as every other route writes it.
    const parents = await prismaRaw.parent.findMany({
      where: { email: { in: [EMAIL, EMAIL.toUpperCase()] } },
    });
    expect(parents).toHaveLength(1);
    expect(parents[0].email).toBe(EMAIL);

    // Both children point at that one guardian.
    const kids = await prismaRaw.student.findMany({
      where: { rollNo: { in: ROLLS } },
      select: { parentId: true },
    });
    expect(kids).toHaveLength(2);
    expect(new Set(kids.map((k) => k.parentId)).size).toBe(1);
    expect(kids[0].parentId).toBe(parents[0].id);
  });
});
