import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * CSV bulk import — phone, email and guardian dedup.
 *
 * The import schema keeps every cell a loose string so one bad value can't
 * reject a whole file with an opaque `rows.47.phone` path; the controller
 * collects problems per row instead. Phone numbers were missed by that per-row
 * pass entirely, so the bulk path accepted numbers the single-record endpoints
 * refuse. These tests pin the two phone columns, and the email column, to the
 * shared rules.
 *
 * ── Tenancy ────────────────────────────────────────────────────────────────
 *
 * This spec used to sign in as `admin@bhs.edu` and import into the seeded
 * Beaconhouse School — the demo institute — and then clean up with a hard
 * `parent.deleteMany` matching any address that merely *contained* `example.c`,
 * scoped to no institute at all. That combination permanently deleted a
 * guardian belonging to a different school during a QA session.
 *
 * So it now does what every other spec here does: signs up a throwaway school of
 * its own, imports into that, and erases it afterwards through the application's
 * own lifecycle — `DELETE /institutes/:id` followed by `/purge` — which cascades
 * the school's students, guardians and users and cannot, by construction, reach
 * another tenant. Nothing here selects rows by a condition.
 */

let sa, admin, instId, seeded = true;
const made = [];
const stamp = Date.now();
const PASSWORD = "ImportSpec123";

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});

/** A throwaway school with its own admin. Returns { id, token }. */
const makeSchool = async (label) => {
  const adminEmail = `import.${label}.${stamp}@test.edu`;
  const res = await request(app).post("/api/auth/signup").send({
    name: `Import ${label} School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `import.school.${label}.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: `Import ${label} Admin`,
    adminEmail,
    adminPassword: PASSWORD,
  });
  const id = res.body.data?.institute?.id;
  if (!id) return {};
  made.push(id);
  await as(sa).patch(`/api/institutes/${id}/status`).send({ status: "ACTIVE" });
  return { id, token: await login(adminEmail, PASSWORD) };
};

/**
 * Erases one school the way the product does it: to the recycle bin, then
 * purged. Everything the school owns goes with it through the schema's own
 * cascades, and the only thing this can ever name is a single institute id.
 *
 * The raw fallback exists so a failure in the API path cannot leave a test
 * school behind for ever; it is still addressed by that one id.
 */
const purgeSchool = async (id) => {
  const removed = await as(sa).delete(`/api/institutes/${id}`);
  const purged = removed.status === 200 ? await as(sa).delete(`/api/institutes/${id}/purge`) : null;
  if (purged?.status === 200) return true;
  await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  return false;
};

/** A row that is valid apart from whatever the test overrides. */
const row = (over = {}) => ({
  name: "Import Probe",
  grade: "Grade 8",
  section: "A",
  rollNo: `IMPORT-PROBE-${Math.random().toString(36).slice(2, 10)}`,
  ...over,
});

const send = (rows, token = admin) =>
  request(app)
    .post("/api/students/import")
    .set("Authorization", `Bearer ${token}`)
    .send({ rows });

/** All problem strings the API reported, flattened. */
const problemsFrom = (res) => (res.body.errors ?? []).flatMap((e) => e.problems ?? []);

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const school = await makeSchool("main");
  if (!school.id || !school.token) { seeded = false; return; }
  instId = school.id;
  admin = school.token;
});

afterAll(async () => {
  for (const id of made) await purgeSchool(id);
  // The signup admins, whose users cascade with their institute — this is a
  // belt-and-braces sweep for a school whose purge failed, and it is bounded by
  // this run's own timestamp.
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
 * The only block that writes. `emailField` lowercases, and the guardian lookup
 * matches on `email`, which Postgres compares case-sensitively — so siblings
 * listed with differently-cased guardian addresses used to produce a separate
 * parent each. Everything created belongs to this spec's own school and goes
 * when that school is purged.
 */
describe("CSV import — guardian dedup is case-insensitive", () => {
  const ROLLS = ["CASEFOLD-1", "CASEFOLD-2"];
  const EMAIL = "casefold.guardian@example.com";

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

    // Scoped to this spec's own school, so a guardian of the same name anywhere
    // else in the database cannot make this pass or fail.
    const parents = await prismaRaw.parent.findMany({
      where: { instituteId: instId, email: { in: [EMAIL, EMAIL.toUpperCase()] } },
    });
    expect(parents).toHaveLength(1);
    // And it is stored lowercased, the same as every other route writes it.
    expect(parents[0].email).toBe(EMAIL);

    // Both children point at that one guardian.
    const kids = await prismaRaw.student.findMany({
      where: { instituteId: instId, rollNo: { in: ROLLS } },
      select: { parentId: true },
    });
    expect(kids).toHaveLength(2);
    expect(new Set(kids.map((k) => k.parentId)).size).toBe(1);
    expect(kids[0].parentId).toBe(parents[0].id);
  });

  it("imports into this spec's own school and nowhere else", async () => {
    if (skip()) return;
    const mine = await prismaRaw.student.count({
      where: { instituteId: instId, rollNo: { in: ROLLS } },
    });
    const elsewhere = await prismaRaw.student.count({
      where: { instituteId: { not: instId }, rollNo: { in: ROLLS } },
    });
    expect(mine).toBe(2);
    expect(elsewhere).toBe(0);

    // The seeded demo schools are read by other specs and must be untouched.
    const demo = await prismaRaw.institute.findFirst({
      where: { name: "Beaconhouse School" },
      select: { id: true },
    });
    if (demo) {
      const probes = await prismaRaw.student.count({
        where: {
          instituteId: demo.id,
          OR: [{ rollNo: { in: ROLLS } }, { name: "Import Probe" }],
        },
      });
      expect(probes, "this spec must not write into the demo institute").toBe(0);
    }
  });
});

/**
 * The regression this file exists to prevent.
 *
 * The old cleanup deleted parents by a substring of their email address, with
 * no tenant scope, and destroyed a guardian belonging to another school. The
 * property that had to replace it is simple enough to state and to check: two
 * schools may hold a guardian at the very same address, and erasing one school
 * must leave the other's guardian exactly where it is.
 *
 * This drives the real `purgeSchool` used by `afterAll`, not a copy of it.
 */
describe("cleanup stays inside its own tenant", () => {
  it("cannot reach a guardian of the same name in another school", async () => {
    if (skip()) return;
    const SHARED = `shared.guardian.${stamp}@example.com`;

    const bystander = await makeSchool("bystander");
    const victim = await makeSchool("victim");
    if (!bystander.token || !victim.token) return;

    for (const school of [bystander, victim]) {
      const res = await as(school.token).post("/api/parents").send({
        name: "Shared Guardian",
        email: SHARED,
        phone: "03001234567",
        relation: "Father",
        createLogin: false,
      });
      expect(res.status).toBe(201);
    }

    // Two schools, one address — the exact shape that went wrong before.
    expect(await prismaRaw.parent.count({ where: { email: SHARED } })).toBe(2);

    await purgeSchool(victim.id);
    made.splice(made.indexOf(victim.id), 1);

    const survivors = await prismaRaw.parent.findMany({
      where: { email: SHARED },
      select: { instituteId: true },
    });
    expect(survivors).toHaveLength(1);
    expect(survivors[0].instituteId).toBe(bystander.id);
  });

  it("takes the purged school's own records with it", async () => {
    if (skip()) return;
    const doomed = await makeSchool("doomed");
    if (!doomed.token) return;

    const res = await send(
      [
        { name: "Doomed One", grade: "Grade 8", section: "A", rollNo: `DOOMED-${stamp}`,
          guardianEmail: `doomed.guardian.${stamp}@example.com` },
      ],
      doomed.token
    );
    expect(res.status).toBe(201);
    expect(await prismaRaw.student.count({ where: { instituteId: doomed.id } })).toBe(1);

    await purgeSchool(doomed.id);
    made.splice(made.indexOf(doomed.id), 1);

    expect(await prismaRaw.student.count({ where: { instituteId: doomed.id } })).toBe(0);
    expect(await prismaRaw.parent.count({ where: { instituteId: doomed.id } })).toBe(0);
    expect(await prismaRaw.institute.findUnique({ where: { id: doomed.id } })).toBeNull();
  });
});

/**
 * A class is a pair of strings on the student, so its spelling is its identity.
 *
 * "grade 8" and "Grade 8" are two different classes. A spreadsheet with the
 * wrong case therefore filed children into one nobody teaches — missing from
 * the register, missing from the timetable, and left behind at promotion —
 * and the import reported it as a clean success.
 *
 * The rule has to stay narrow. It refuses only a spelling the school already
 * writes another way; a class it has never had still imports, because adding
 * Grade 11 is an ordinary thing for a school to do.
 */
describe("a class spelt a different way from the school's own", () => {
  it("is refused, and names the spelling already in use", async () => {
    if (skip()) return;
    // The school has to know "Grade 8" before a lookalike can be spotted.
    await send([row()]);

    const res = await send([row({ grade: "grade 8" })]);

    // 422, the status this route already uses for a row it will not accept.
    expect(res.status).toBe(422);
    expect(problemsFrom(res).join(" ")).toMatch(/grade "grade 8" is written "Grade 8"/);
  });

  it("catches it on the section too", async () => {
    if (skip()) return;
    const res = await send([row({ section: "a" })]);

    expect(res.status).toBe(422);
    expect(problemsFrom(res).join(" ")).toMatch(/section "a" is written "A"/);
  });

  it("still accepts a class the school has never had", async () => {
    if (skip()) return;
    const res = await send([row({ grade: "Grade 11", section: "Z" })]);

    expect(res.status, res.body.message).toBe(201);
  });

  it("says nothing about a spelling the school already uses", async () => {
    if (skip()) return;
    const res = await send([row()]);

    expect(res.status, res.body.message).toBe(201);
  });
});

/**
 * The near-miss rule has to actually normalise, not just lowercase.
 *
 * The first version of this shipped with `/s+/g` where `/\s+/g` was meant — a
 * lost backslash, so it replaced the letter "s" instead of whitespace. The
 * tests above did not notice, because a difference of case alone is mangled
 * identically on both sides and still matches:
 *
 *     "Grade 8"  -> "grade 8"     "grade 8"  -> "grade 8"    (agrees, wrongly)
 *     "Grade  8" -> "grade  8"    vs "grade 8"               (misses)
 *     "Class A"  -> "cla  a"                                 (mangled)
 *
 * Whitespace is the case that tells the two regexes apart, so it is the case
 * that is pinned.
 */
describe("the near-miss rule normalises spacing, not the letter s", () => {
  it("catches a class that differs only by a doubled space", async () => {
    if (skip()) return;
    await send([row()]); // the school learns "Grade 8"

    const res = await send([row({ grade: "Grade  8" })]);

    expect(res.status).toBe(422);
    expect(problemsFrom(res).join(" ")).toMatch(/is written "Grade 8"/);
  });

  it("leaves a name that merely contains an s alone", async () => {
    if (skip()) return;
    const res = await send([row({ grade: "Class S", section: "Q" })]);

    expect(res.status, res.body.message).toBe(201);
  });
});

/**
 * The student form is deliberately NOT guarded, and this pins that choice.
 *
 * The same rule was briefly applied to POST /api/students, and the full suite
 * showed why it must not be. The seeded school already contains one student
 * whose grade is "grade 8" — real data, typed by hand long before any of this
 * — and with the rule in place every later attempt to add a "Grade 8" student
 * to that school was refused:
 *
 *     grade "Grade 8" is written "grade 8" everywhere else in this school
 *
 * The rule cannot tell which of two spellings is the mistake. On a bulk import
 * that is still worth stopping: it is all-or-nothing, the admin sees the
 * problem before anything is written, and one wrong column can misfile a whole
 * year group. On a single child it inverts — one old typo would block every
 * correct entry after it, punishing the person cleaning up rather than the one
 * who made the mess.
 *
 * So the form stays open. If this ever changes, it needs a rule that can tell
 * an established spelling from a one-off, not just a near-miss.
 */
describe("the student form is deliberately left open", () => {
  it("accepts a class the school spells another way, and says nothing", async () => {
    if (skip()) return;
    await send([row()]); // "Grade 8" exists

    const res = await request(app)
      .post("/api/students")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        name: "Form Variant",
        grade: "grade 8",
        section: "A",
        rollNo: `FORM-${Math.random().toString(36).slice(2, 9)}`,
      });

    expect(res.status, res.body.message).toBe(201);
  });
});
