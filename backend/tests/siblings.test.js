import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * One guardian, several children.
 *
 * The commonest family a Pakistani private school has on its roll is a family
 * with more than one child in the school, and the product could not describe
 * one. The database always could — `Student.parentId` is a nullable foreign key
 * and `Parent.students` is a list — and the CSV import already reused a
 * guardian by email. What was missing sat above it: the "Add Parent" form
 * offered a single "Child (Student)" dropdown, the edit form offered nothing at
 * all, the admin's list rendered `students.find(s => s.id === p.studentId)`, and
 * the parent portal opened `db.students.find(s => s.id === parent.studentId)`
 * and showed that one child for ever.
 *
 * So a father of three either got three separate guardian accounts with three
 * separate passwords, or saw one child and had no idea the others existed.
 *
 * These tests pin the API side of that: a guardian holds many children, the
 * links can be edited afterwards, every child's data comes back through the
 * parent's own endpoints, and linking a child is scoped to the school doing it.
 *
 * A throwaway school, erased through the application's lifecycle in afterAll.
 */

let sa, admin, parentToken, instId, parentId, seeded = true;
let zain, alia, omar;
const made = [];
const stamp = Date.now();
const PASSWORD = "SiblingSpec!2026";

const signIn = (email, password) => request(app).post("/api/auth/login").send({ email, password });
const tokenFor = async (email, password) => {
  const res = await signIn(email, password);
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
  delete: (u) => request(app).delete(u).set("Authorization", `Bearer ${t}`),
});

const purgeSchool = async (id) => {
  const removed = await as(sa).delete(`/api/institutes/${id}`);
  const purged = removed.status === 200 ? await as(sa).delete(`/api/institutes/${id}/purge`) : null;
  if (purged?.status !== 200) await prismaRaw.institute.delete({ where: { id } }).catch(() => {});
};

const addChild = async (name, roll) =>
  (await as(admin).post("/api/students").send({
    name, grade: "Grade 8", section: "A", rollNo: roll,
  })).body.data?.id;

const guardian = async () => (await as(admin).get(`/api/parents/${parentId}`)).body.data;
const linkedIds = (p) => (p.students ?? []).map((s) => s.id).sort();

beforeAll(async () => {
  sa = await tokenFor("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `sib.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Sibling School ${stamp}`, city: "Rawalpindi", phone: "03001234567",
    email: `sib.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Sibling Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  made.push(instId);
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await tokenFor(adminEmail, PASSWORD);
  if (!admin) { seeded = false; return; }

  zain = await addChild("Zain Ahmed", `SB1-${stamp}`);
  alia = await addChild("Alia Ahmed", `SB2-${stamp}`);
  omar = await addChild("Omar Ahmed", `SB3-${stamp}`);
  if (!zain || !alia || !omar) { seeded = false; return; }
});

afterAll(async () => {
  for (const id of made) await purgeSchool(id);
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

describe("a guardian with more than one child", () => {
  it("is created holding all of them at once", async () => {
    if (skip()) return;
    const parentEmail = `sib.p.${stamp}@test.edu`;
    const res = await as(admin).post("/api/parents").send({
      name: "Ahmed Sahib", email: parentEmail, relation: "Father", phone: "03009999999",
      createLogin: true, password: PASSWORD,
      studentIds: [zain, alia],
    });
    expect(res.status).toBe(201);
    parentId = res.body.data.id;
    parentToken = await tokenFor(parentEmail, PASSWORD);

    expect(linkedIds(await guardian())).toEqual([zain, alia].sort());
  });

  it("gains a third without losing the first two", async () => {
    if (skip() || !parentId) return;
    const res = await as(admin).patch(`/api/parents/${parentId}`).send({
      studentIds: [zain, alia, omar],
    });
    expect(res.status).toBe(200);
    expect(linkedIds(await guardian())).toEqual([zain, alia, omar].sort());
  });

  /**
   * The list an admin reads. It used to render only the first child, which is
   * how a father of three looked like a father of one on the screen the school
   * actually works from.
   */
  it("is listed with every child, not just the first", async () => {
    if (skip() || !parentId) return;
    const res = await as(admin).get("/api/parents?limit=50");
    const row = res.body.data.find((p) => p.id === parentId);
    expect(row.childrenCount).toBe(3);
    expect(row.students.map((s) => s.name).sort()).toEqual(
      ["Alia Ahmed", "Omar Ahmed", "Zain Ahmed"]
    );
  });

  it("loses one when the school unlinks them, and the child stays enrolled", async () => {
    if (skip() || !parentId) return;
    await as(admin).patch(`/api/parents/${parentId}`).send({ studentIds: [zain, alia] });
    expect(linkedIds(await guardian())).toEqual([zain, alia].sort());

    // Omar is still a student of this school; he simply has no guardian now.
    const omarRow = (await as(admin).get(`/api/students/${omar}`)).body.data;
    expect(omarRow.id).toBe(omar);
    expect(omarRow.parent).toBeNull();

    await as(admin).patch(`/api/parents/${parentId}`).send({ studentIds: [zain, alia, omar] });
  });
});

describe("what the guardian sees when they sign in", () => {
  it("all three children, not the first one", async () => {
    if (skip() || !parentToken) return;
    const res = await as(parentToken).get("/api/parents/me/children");
    expect(res.status).toBe(200);
    expect(res.body.data.map((s) => s.id).sort()).toEqual([zain, alia, omar].sort());
  });

  it("a dashboard that counts them all", async () => {
    if (skip() || !parentToken) return;
    const d = (await as(parentToken).get("/api/dashboard/parent")).body.data;
    expect(d.kpis.children).toBe(3);
    expect(d.children).toHaveLength(3);
  });

  it("and may open any of them, not only the first", async () => {
    if (skip() || !parentToken) return;
    for (const id of [zain, alia, omar]) {
      expect((await as(parentToken).get(`/api/students/${id}`)).status).toBe(200);
      expect((await as(parentToken).get(`/api/students/${id}/report`)).status).toBe(200);
    }
  });

  it("but still no child of another family", async () => {
    if (skip() || !parentToken) return;
    const stranger = await addChild("Not Theirs", `SB9-${stamp}`);
    // Scoped away rather than refused, so the id itself leaks nothing.
    expect((await as(parentToken).get(`/api/students/${stranger}`)).status).toBe(404);
  });
});

describe("linking a child to a guardian from the student's side", () => {
  it("attaches a sibling to a guardian the school already has", async () => {
    if (skip() || !parentId) return;
    const late = await addChild("Late Sibling", `SB4-${stamp}`);
    const res = await as(admin).patch(`/api/students/${late}`).send({ parentId });
    expect(res.status).toBe(200);
    expect(res.body.data.parent.id).toBe(parentId);

    const children = (await as(parentToken).get("/api/parents/me/children")).body.data;
    expect(children.map((s) => s.id)).toContain(late);

    // Put the family back to three for anything that follows.
    await as(admin).patch(`/api/students/${late}`).send({ parentId: null });
  });

  /**
   * A guardian belonging to this school.
   *
   * `createStudent` has always checked this; the update path spread whatever
   * arrived straight into the row, so one school could hand its own student to
   * another school's parent — who would then have that child on their portal,
   * with marks, attendance and fees. Siblings make this an everyday path rather
   * than an exotic one, because linking a second child *is* an update.
   */
  it("refuses a guardian from another school", async () => {
    if (skip()) return;
    const otherEmail = `sib.other.${stamp}@test.edu`;
    const other = await request(app).post("/api/auth/signup").send({
      name: `Sibling Other ${stamp}`, city: "Karachi", phone: "03001234567",
      email: `sib.otherschool.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
      adminName: "Other Admin", adminEmail: otherEmail, adminPassword: PASSWORD,
    });
    const otherId = other.body.data?.institute?.id;
    if (!otherId) return;
    made.push(otherId);
    await as(sa).patch(`/api/institutes/${otherId}/status`).send({ status: "ACTIVE" });
    const otherAdmin = await tokenFor(otherEmail, PASSWORD);

    const theirParent = (await as(otherAdmin).post("/api/parents").send({
      name: "Other Guardian", email: `sib.op.${stamp}@test.edu`,
      createLogin: false,
    })).body.data?.id;
    if (!theirParent) return;

    const res = await as(admin).patch(`/api/students/${zain}`).send({ parentId: theirParent });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/institute/i);

    // And the link genuinely did not happen.
    const row = await prismaRaw.student.findUnique({
      where: { id: zain },
      select: { parentId: true },
    });
    expect(row.parentId).toBe(parentId);
  });

  it("refuses a guardian that does not exist at all", async () => {
    if (skip()) return;
    const res = await as(admin).patch(`/api/students/${alia}`).send({ parentId: "no-such-parent" });
    expect(res.status).toBe(400);
  });
});

describe("removing the guardian of several children", () => {
  it("leaves every one of them enrolled", async () => {
    if (skip() || !parentId) return;
    const res = await as(admin).delete(`/api/parents/${parentId}`);
    expect(res.status).toBe(200);

    for (const id of [zain, alia, omar]) {
      const row = (await as(admin).get(`/api/students/${id}`)).body.data;
      expect(row.id).toBe(id);
      expect(row.parent).toBeNull();
    }
  });

  /**
   * Restoring says to re-link them, and means it: the children were unlinked
   * when the guardian was removed, so the guardian comes back holding nobody.
   * Saying so is better than a screen that silently shows an empty family.
   */
  it("comes back with no children until the school re-links them", async () => {
    if (skip() || !parentId) return;
    const res = await as(admin).post(`/api/parents/${parentId}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/re-link/i);
    expect(linkedIds(await guardian())).toEqual([]);

    await as(admin).patch(`/api/parents/${parentId}`).send({ studentIds: [zain, alia, omar] });
    expect(linkedIds(await guardian())).toEqual([zain, alia, omar].sort());
  });
});
