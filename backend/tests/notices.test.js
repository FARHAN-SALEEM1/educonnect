import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

/**
 * Notices from a teacher's side.
 *
 * The teacher portal now has a Post Notice button, so the permission it leans
 * on is worth pinning down: a teacher may publish, may revise what they
 * published, and may touch nothing else on the board.
 *
 * Every notice this suite creates is removed again in afterAll.
 */

let bhsAdmin, teacher, otherTeacher, parent, lacasAdmin, seeded = true;
let teacherUserId;
const created = [];

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

/** Publish as `token` and remember the id so afterAll can clean up. */
const publish = async (token, title, extra = {}) => {
  const res = await as(token).post("/api/notices").send({ title, body: `${title} — body`, ...extra });
  if (res.status === 201) created.push(res.body.data.id);
  return res;
};

beforeAll(async () => {
  [bhsAdmin, teacher, otherTeacher, parent, lacasAdmin] = await Promise.all([
    login("admin@bhs.edu", "admin123"),
    login("hassan@bhs.edu", "teach123"),
    login("tariq@bhs.edu", "teach123"),
    login("sara@gmail.com", "parent123"),
    login("admin@lacas.edu", "admin123"),
  ]);
  if (!bhsAdmin || !teacher || !otherTeacher || !parent || !lacasAdmin) { seeded = false; return; }
  const me = await as(teacher).get("/api/auth/me");
  teacherUserId = me.body.data?.id ?? me.body.data?.user?.id;
  if (!teacherUserId) seeded = false;
});

afterAll(async () => {
  if (created.length) await prisma.notice.deleteMany({ where: { id: { in: created } } });
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

describe("a teacher publishing a notice", () => {
  it("accepts the notice and records the teacher as its author", async () => {
    if (skip()) return;
    const res = await publish(teacher, "QA — teacher notice");
    expect(res.status).toBe(201);
    expect(res.body.data.createdBy.id).toBe(teacherUserId);
    expect(res.body.data.createdBy.role).toBe("TEACHER");
  });

  it("refuses to post into another institute by naming it in the body", async () => {
    if (skip()) return;
    const lacas = await prisma.institute.findFirst({ where: { name: "LACAS" } });
    const before = await prisma.notice.count({ where: { instituteId: lacas.id } });

    const res = await publish(teacher, "QA — cross-tenant post", { instituteId: lacas.id });
    expect(res.status).toBe(403);

    // Refused outright rather than quietly re-homed, and nothing landed there.
    expect(await prisma.notice.count({ where: { instituteId: lacas.id } })).toBe(before);
  });

  it("shows the notice to the institute's admin", async () => {
    if (skip()) return;
    const res = await as(bhsAdmin).get("/api/notices?limit=200");
    expect(res.status).toBe(200);
    expect(res.body.data.some((n) => n.title === "QA — teacher notice")).toBe(true);
  });

  it("keeps it out of another institute's board", async () => {
    if (skip()) return;
    const res = await as(lacasAdmin).get("/api/notices?limit=200");
    expect(res.status).toBe(200);
    expect(res.body.data.some((n) => n.title === "QA — teacher notice")).toBe(false);
  });

  it("refuses a parent the same thing", async () => {
    if (skip()) return;
    const res = await as(parent).post("/api/notices").send({ title: "QA — parent", body: "nope" });
    expect(res.status).toBe(403);
  });
});

describe("a teacher editing", () => {
  it("may revise a notice they posted themselves", async () => {
    if (skip()) return;
    const own = await publish(teacher, "QA — mine to edit");
    const res = await as(teacher).patch(`/api/notices/${own.body.data.id}`).send({ title: "QA — revised" });
    expect(res.status).toBe(200);

    const row = await prisma.notice.findUnique({ where: { id: own.body.data.id } });
    expect(row.title).toBe("QA — revised");
  });

  it("may not rewrite a notice the admin posted", async () => {
    if (skip()) return;
    const theirs = await publish(bhsAdmin, "QA — admin notice");
    const res = await as(teacher).patch(`/api/notices/${theirs.body.data.id}`).send({ title: "Hijacked" });
    expect(res.status).toBe(403);

    // and the notice is genuinely untouched, not merely reported as refused
    const row = await prisma.notice.findUnique({ where: { id: theirs.body.data.id } });
    expect(row.title).toBe("QA — admin notice");
  });

  it("may not delete, not even their own", async () => {
    if (skip()) return;
    const own = await publish(teacher, "QA — mine to keep");
    const res = await as(teacher).delete(`/api/notices/${own.body.data.id}`);
    expect(res.status).toBe(403);

    const row = await prisma.notice.findUnique({ where: { id: own.body.data.id } });
    expect(row).not.toBeNull();
  });

  it("leaves the admin free to edit and delete a teacher's notice", async () => {
    if (skip()) return;
    const own = await publish(teacher, "QA — admin cleans up");
    const patched = await as(bhsAdmin).patch(`/api/notices/${own.body.data.id}`).send({ title: "QA — admin edited it" });
    expect(patched.status).toBe(200);

    const removed = await as(bhsAdmin).delete(`/api/notices/${own.body.data.id}`);
    expect(removed.status).toBe(200);
    expect(await prisma.notice.findUnique({ where: { id: own.body.data.id } })).toBeNull();
  });
});

describe("one teacher against another", () => {
  it("cannot rewrite a colleague's notice", async () => {
    if (skip()) return;
    const theirs = await publish(otherTeacher, "QA — colleague's notice");
    const res = await as(teacher).patch(`/api/notices/${theirs.body.data.id}`).send({ title: "Hijacked" });
    expect(res.status).toBe(403);

    const row = await prisma.notice.findUnique({ where: { id: theirs.body.data.id } });
    expect(row.title).toBe("QA — colleague's notice");
  });

  it("cannot delete a colleague's notice", async () => {
    if (skip()) return;
    const theirs = await publish(otherTeacher, "QA — colleague keeps this");
    const res = await as(teacher).delete(`/api/notices/${theirs.body.data.id}`);
    expect(res.status).toBe(403);
    expect(await prisma.notice.findUnique({ where: { id: theirs.body.data.id } })).not.toBeNull();
  });

  it("can still read it — same institute, same board", async () => {
    if (skip()) return;
    const theirs = await publish(otherTeacher, "QA — colleague readable");
    const res = await as(teacher).get(`/api/notices/${theirs.body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("QA — colleague readable");
  });
});

describe("audience filtering", () => {
  /**
   * The author exemption. A teacher who addresses parents used to watch their
   * own notice disappear from the board the instant they published it.
   */
  it("keeps a teacher's own parents-only notice on their board", async () => {
    if (skip()) return;
    const mine = await publish(teacher, "QA — parents only, mine", { audience: ["PARENT"] });
    expect(mine.status).toBe(201);

    const res = await as(teacher).get("/api/notices?limit=200");
    expect(res.body.data.some((n) => n.id === mine.body.data.id)).toBe(true);
  });

  it("still hides a parents-only notice written by someone else", async () => {
    if (skip()) return;
    const theirs = await publish(bhsAdmin, "QA — parents only, admin's", { audience: ["PARENT"] });
    const res = await as(teacher).get("/api/notices?limit=200");
    expect(res.body.data.some((n) => n.id === theirs.body.data.id)).toBe(false);
  });

  it("shows a parents-only notice to parents", async () => {
    if (skip()) return;
    const forThem = await publish(bhsAdmin, "QA — for parents", { audience: ["PARENT"] });
    const res = await as(parent).get("/api/notices?limit=200");
    expect(res.body.data.some((n) => n.id === forThem.body.data.id)).toBe(true);
  });

  it("keeps a teachers-only notice away from parents", async () => {
    if (skip()) return;
    const staff = await publish(bhsAdmin, "QA — staff only", { audience: ["TEACHER"] });
    const seen = await as(parent).get("/api/notices?limit=200");
    expect(seen.body.data.some((n) => n.id === staff.body.data.id)).toBe(false);

    // and the people it was for do see it
    const staffView = await as(teacher).get("/api/notices?limit=200");
    expect(staffView.body.data.some((n) => n.id === staff.body.data.id)).toBe(true);
  });

  it("does not filter by audience for admins", async () => {
    if (skip()) return;
    const staff = await publish(teacher, "QA — staff only, by teacher", { audience: ["TEACHER"] });
    const res = await as(bhsAdmin).get("/api/notices?limit=200");
    expect(res.body.data.some((n) => n.id === staff.body.data.id)).toBe(true);
  });
});
