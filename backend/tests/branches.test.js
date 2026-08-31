import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * One school, several campuses.
 *
 * A branch is a subdivision inside an institute, never a tenant of its own: a
 * school running three campuses signs one contract and expects its head office
 * to see all three at once. So the institute stays the boundary every query is
 * scoped to, and everything here checks that a campus cannot be reached from
 * another school — the same rule students and teachers already live under.
 *
 * The feature is opt-in, and the last block is the one that matters most for a
 * school that never uses it: with no branches at all, nothing changes.
 *
 * Two throwaway schools, both deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "BranchSpec123";

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

let sa, admin, other, instId, otherInstId;
let seeded = true;

const makeSchool = async (tag) => {
  const adminEmail = `branch.${tag}.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Branch ${tag} School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `branch.school.${tag}.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: `Branch ${tag} Admin`,
    adminEmail,
    adminPassword: PASSWORD,
  });
  const id = signup.body.data?.institute?.id;
  if (!id) return [null, null];
  await as(sa).patch(`/api/institutes/${id}/status`).send({ status: "ACTIVE" });
  return [id, await login(adminEmail)];
};

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }
  [instId, admin] = await makeSchool("a");
  [otherInstId, other] = await makeSchool("b");
  if (!instId || !admin || !otherInstId || !other) seeded = false;
}, 90_000);

afterAll(async () => {
  for (const id of [instId, otherInstId]) {
    if (id) await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
  }
  await prismaRaw.user
    .deleteMany({ where: { email: { contains: `.${stamp}@test.edu` } } })
    .catch(() => {});
});

const skip = () => !seeded;

/**
 * The setup ran.
 *
 * Every test below opens with `if (skip()) return`, which lets this file stand
 * down on an unseeded machine — and which also turns a broken `beforeAll` into a
 * column of green ticks. This is the one check that does not skip.
 */
it("built its fixtures", async () => {
  const { seedPresent } = await import("./helpers/fixtures.js");
  if (!(await seedPresent())) return;
  expect(seeded, "beforeAll did not complete — every test in this file is vacuous").toBe(true);
});

const mk = (body) => as(admin).post("/api/branches").send(body);

describe("opening a campus", () => {
  it("adds one, and counts nobody on it yet", async () => {
    if (skip()) return;
    const res = await mk({ name: "Gulberg Campus", code: "glb", city: "Lahore", isMain: true });

    expect(res.status).toBe(201);
    expect(res.body.data.code, "the code is what a filter carries, so it is normalised").toBe(
      "GLB"
    );
    expect(res.body.data.studentCount).toBe(0);
  });

  it("refuses a code another campus already answers to", async () => {
    if (skip()) return;
    const res = await mk({ name: "Somewhere Else", code: "GLB" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/GLB/);
  });

  it("keeps exactly one main campus", async () => {
    if (skip()) return;
    const second = await mk({ name: "DHA Campus", code: "DHA", isMain: true });
    expect(second.status).toBe(201);

    const list = (await as(admin).get("/api/branches")).body.data;
    const main = list.filter((b) => b.isMain);

    expect(main, "a second main would make 'where does a new student land' a coin toss").toHaveLength(
      1
    );
    expect(main[0].code).toBe("DHA");
  });
});

describe("who is on which campus", () => {
  const roll = (n) => `BR-${n}-${stamp}`;
  let dha, glb, moved;

  it("moves students onto one", async () => {
    if (skip()) return;
    const list = (await as(admin).get("/api/branches")).body.data;
    dha = list.find((b) => b.code === "DHA").id;
    glb = list.find((b) => b.code === "GLB").id;

    const made = [];
    for (const n of [1, 2, 3]) {
      const s = await as(admin)
        .post("/api/students")
        .send({ name: `Branch Child ${n}`, grade: "Grade 8", section: "A", rollNo: roll(n) });
      made.push(s.body.data?.id);
    }
    moved = made.slice(0, 2);

    const res = await as(admin).post(`/api/branches/${dha}/reassign`).send({ studentIds: moved });

    expect(res.status).toBe(200);
    expect(res.body.data.students).toBe(2);
  });

  it("filters the roster down to that campus", async () => {
    if (skip()) return;
    const only = (await as(admin).get(`/api/students?branchId=${dha}&limit=100`)).body.data;

    expect(only).toHaveLength(2);
    expect(only.every((s) => s.branch?.code === "DHA")).toBe(true);
  });

  it("leaves the rest of the school on the roll, without a campus", async () => {
    if (skip()) return;
    const all = (await as(admin).get("/api/students?limit=100")).body.data;

    expect(all.length, "the unfiltered roll is still the whole school").toBe(3);
    expect(all.filter((s) => !s.branch), "a child nobody assigned has no campus, not a wrong one")
      .toHaveLength(1);
  });

  it("counts them on the campus itself", async () => {
    if (skip()) return;
    const list = (await as(admin).get("/api/branches")).body.data;

    expect(list.find((b) => b.code === "DHA").studentCount).toBe(2);
    expect(list.find((b) => b.code === "GLB").studentCount).toBe(0);
  });
});

describe("teachers belong to a campus too", () => {
  /**
   * Its own campus, not one the blocks below still need.
   *
   * The first version closed GLB to prove the staff survive it, and the
   * cross-tenant tests further down could then no longer find GLB to be
   * refused access to. A test that dismantles a fixture other tests read is a
   * test that makes its neighbours lie.
   */
  let own;

  it("moves them and filters the staff list down", async () => {
    if (skip()) return;
    own = (await mk({ name: "Staff Campus", code: "STF" })).body.data.id;

    const made = await as(admin)
      .post("/api/teachers")
      .send({ name: "Campus Sir", email: `campus.sir.${stamp}@test.edu`, phone: "03001234567" });
    expect(made.status).toBe(201);

    const res = await as(admin)
      .post(`/api/branches/${own}/reassign`)
      .send({ teacherIds: [made.body.data.id] });
    expect(res.body.data.teachers).toBe(1);

    const only = (await as(admin).get(`/api/teachers?branchId=${own}&limit=100`)).body.data;
    expect(only).toHaveLength(1);
    expect(only[0].branch?.code).toBe("STF");

    const counted = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "STF");
    expect(counted.teacherCount).toBe(1);
  });

  it("keeps them on the staff list when their campus closes", async () => {
    if (skip()) return;
    const before = (await as(admin).get("/api/teachers?limit=100")).body.data.length;

    const res = await as(admin).delete(`/api/branches/${own}`);
    expect(res.body.data.teachers).toBe(1);

    const after = (await as(admin).get("/api/teachers?limit=100")).body.data;
    expect(after.length, "a building shutting is not a teacher leaving").toBe(before);
    expect(after.every((t) => t.branch?.code !== "STF")).toBe(true);
  });
});

describe("a roster imported into a campus", () => {
  /**
   * The campus is named once for the file, not once per row.
   *
   * A school with three buildings exports one roster at a time, and a spelled
   * out campus column would have to agree with itself on two thousand lines to
   * mean anything. Editing a child offered a campus and importing two thousand
   * of them did not, which is the wrong way round.
   */
  it("puts every imported row on the campus the file names", async () => {
    if (skip()) return;
    const glb = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB").id;

    const res = await as(admin)
      .post("/api/students/import")
      .send({
        branchId: glb,
        rows: [
          { name: "Imported One", grade: "Grade 3", section: "A", rollNo: `IMP-A-${stamp}` },
          { name: "Imported Two", grade: "Grade 3", section: "A", rollNo: `IMP-B-${stamp}` },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.imported).toBe(2);

    const on = (await as(admin).get(`/api/students?branchId=${glb}&limit=100`)).body.data;
    expect(on.map((s) => s.name)).toEqual(
      expect.arrayContaining(["Imported One", "Imported Two"])
    );

    const counted = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB");
    expect(counted.studentCount).toBe(2);
  });

  it("refuses a campus belonging to another school", async () => {
    if (skip()) return;
    const glb = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB").id;

    const res = await as(other)
      .post("/api/students/import")
      .send({
        branchId: glb,
        rows: [{ name: "Trespass Import", grade: "Grade 3", section: "A", rollNo: `TI-${stamp}` }],
      });

    expect(res.status, "checked once for the batch, before a single row is written").toBe(400);

    const none = await prismaRaw.student.findFirst({ where: { rollNo: `TI-${stamp}` } });
    expect(none, "and nothing was imported").toBeNull();
  });
});

describe("closing a campus", () => {
  it("keeps every child on the school's roll", async () => {
    if (skip()) return;
    const before = (await as(admin).get("/api/students?limit=100")).body.data.length;
    const dha = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "DHA").id;

    const res = await as(admin).delete(`/api/branches/${dha}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students, "it says how many it unassigned").toBe(2);

    const after = (await as(admin).get("/api/students?limit=100")).body.data;
    expect(after.length, "a building shutting is not a child leaving").toBe(before);
    expect(after.every((s) => s.branch?.code !== "DHA")).toBe(true);
  });

  it("takes the campus out of the list", async () => {
    if (skip()) return;
    const list = (await as(admin).get("/api/branches")).body.data;

    expect(list.some((b) => b.code === "DHA")).toBe(false);
  });
});

describe("one school's campuses are not another's", () => {
  it("does not list them", async () => {
    if (skip()) return;
    expect((await as(other).get("/api/branches")).body.data).toHaveLength(0);
  });

  it("will not rename one", async () => {
    if (skip()) return;
    const glb = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB").id;

    expect((await as(other).patch(`/api/branches/${glb}`).send({ name: "Taken" })).status).toBe(404);
    expect((await as(other).delete(`/api/branches/${glb}`)).status).toBe(404);
  });

  it("will not move its own students onto one", async () => {
    if (skip()) return;
    const glb = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB").id;
    const mine = (await as(admin).get("/api/students?limit=100")).body.data[0].id;

    expect((await as(other).post(`/api/branches/${glb}/reassign`).send({ studentIds: [mine] })).status)
      .toBe(404);

    // and the student is still where they were
    const still = await prismaRaw.student.findUnique({ where: { id: mine }, select: { branchId: true } });
    expect(still.branchId).not.toBe(glb);
  });

  it("cannot park its own student on one", async () => {
    if (skip()) return;
    const glb = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB").id;
    const before = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB").studentCount;

    const res = await as(other)
      .post("/api/students")
      .send({ name: "Trespasser", grade: "Grade 9", section: "A", rollNo: `TR-${stamp}`, branchId: glb });

    expect(res.status, "a campus it cannot see is not a campus it can fill").toBe(400);

    const after = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB");
    expect(after.studentCount, "and no foreign headcount lands on the card").toBe(before);
  });

  it("cannot move an existing student onto one by editing them", async () => {
    if (skip()) return;
    const glb = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB").id;
    const made = await as(other)
      .post("/api/students")
      .send({ name: "Edit Trespasser", grade: "Grade 9", section: "A", rollNo: `ET-${stamp}` });

    const res = await as(other).patch(`/api/students/${made.body.data.id}`).send({ branchId: glb });

    expect(res.status).toBe(400);
    const still = await prismaRaw.student.findUnique({
      where: { id: made.body.data.id },
      select: { branchId: true },
    });
    expect(still.branchId).toBeNull();
  });

  it("cannot post its teachers to one either", async () => {
    if (skip()) return;
    const glb = (await as(admin).get("/api/branches")).body.data.find((b) => b.code === "GLB").id;

    const res = await as(other)
      .post("/api/teachers")
      .send({ name: "Trespass Sir", email: `trespass.${stamp}@test.edu`, branchId: glb });

    expect(res.status).toBe(400);
  });
  it("cannot reach another school's students through its own campus", async () => {
    if (skip()) return;
    const theirs = await as(other).post("/api/branches").send({ name: "Their Campus", code: "THR" });
    const mine = (await as(admin).get("/api/students?limit=100")).body.data[0].id;

    const res = await as(other)
      .post(`/api/branches/${theirs.body.data.id}/reassign`)
      .send({ studentIds: [mine] });

    expect(res.status, "the campus is theirs, so the call is allowed").toBe(200);
    expect(res.body.data.students, "but the student is not, so nobody moves").toBe(0);
  });
});

describe("a school that never opens a second campus", () => {
  it("sees no campuses and a roster that behaves exactly as before", async () => {
    if (skip()) return;
    const branches = (await as(other).get("/api/branches")).body.data.filter((b) => b.code !== "THR");
    expect(branches).toHaveLength(0);

    const res = await as(other).get("/api/students?limit=100");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
