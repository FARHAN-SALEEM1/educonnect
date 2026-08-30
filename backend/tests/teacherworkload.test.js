import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * A teacher's workload counts children who are still at the school.
 *
 * `teacherWorkload` walks `subject.enrollments` and reaches the student through
 * a nested `include`. The soft-delete extension only rewrites the top-level
 * `where` of a soft-deletable model, and the top-level model here is `Subject` —
 * so a removed child kept counting. Measured on the seeded school before the
 * fix, with one Grade 9 student in the recycle bin:
 *
 *     Mr. Ali      1 student   ["9B"]     <- their only student was removed
 *     Mr. Tariq    1 student   ["9B"]
 *     Ms. Hina     1 student   ["9B"]
 *     Ms. Sara     1 student   ["9B"]
 *     Mr. Hassan   4 students  ["10A","9B"]
 *     Ms. Fatima   4 students  ["10A","9B"]
 *
 * Four members of staff were shown a class with nobody in it, and the two with
 * real rosters were told they held one child more than they did — while the
 * same teacher's student list, which goes through `studentScopeWhere`, said
 * something different again.
 *
 * The enrolment itself must survive: it is what a restore puts back.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "Workload123";

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

let sa, admin, instId, teacher, subject, stays, leaves;
let seeded = true;

/** What the admin's staff list reports for this spec's teacher. */
const workload = async () => {
  const res = await as(admin).get("/api/teachers?limit=100");
  const row = (res.body.data ?? []).find((t) => t.id === teacher.id);
  return { students: row?.students, classes: row?.classes };
};

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `wl.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Workload School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `wl.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "WL Admin",
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

  teacher = (
    await as(admin).post("/api/teachers").send({
      name: "Workload Sir",
      email: `wl.teacher.${stamp}@test.edu`,
      phone: "03001234567",
    })
  ).body.data;
  subject = (
    await as(admin).post("/api/subjects").send({
      name: "Mathematics",
      grade: "Grade 8",
      code: `WL-${stamp}`,
      teacherId: teacher?.id,
    })
  ).body.data;
  if (!teacher || !subject) {
    seeded = false;
    return;
  }

  const make = async (name, roll) =>
    (
      await as(admin).post("/api/students").send({
        name,
        grade: "Grade 8",
        section: "A",
        rollNo: roll,
      })
    ).body.data;
  stays = await make("Workload Stays", `WL-S-${stamp}`);
  leaves = await make("Workload Leaves", `WL-L-${stamp}`);
  if (!stays || !leaves) {
    seeded = false;
    return;
  }
  for (const s of [stays, leaves]) {
    await as(admin).post("/api/subjects/enroll").send({ studentId: s.id, subjectId: subject.id });
  }
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

describe("before anyone leaves", () => {
  it("counts both children and the one class", async () => {
    if (skip()) return;
    const w = await workload();

    expect(w.students, "setup did not enrol both children").toBe(2);
    expect(w.classes).toEqual(["8A"]);
  });
});

describe("after one child is removed", () => {
  it("drops to one, and the class stays", async () => {
    if (skip()) return;
    expect((await as(admin).delete(`/api/students/${leaves.id}`)).status).toBe(200);

    const w = await workload();
    expect(w.students).toBe(1);
    expect(w.classes).toEqual(["8A"]);
  });

  it("agrees with the teacher's own student list", async () => {
    if (skip()) return;
    const t = await login(`wl.teacher.${stamp}@test.edu`, PASSWORD);
    if (!t) return; // no login was created for this teacher

    const res = await as(t).get("/api/students?limit=100");
    const names = (res.body.data ?? []).map((s) => s.name);

    expect(names).toEqual(["Workload Stays"]);
  });

  it("keeps the enrolment, so a restore puts it back", async () => {
    if (skip()) return;
    expect(
      await prismaRaw.enrollment.count({ where: { studentId: leaves.id } })
    ).toBe(1);
  });
});

describe("after the last child is removed", () => {
  /**
   * The part that reached a teacher as a lie rather than a number: a class in
   * their list that opens onto nobody.
   */
  it("shows no students and no phantom class", async () => {
    if (skip()) return;
    expect((await as(admin).delete(`/api/students/${stays.id}`)).status).toBe(200);

    const w = await workload();
    expect(w.students).toBe(0);
    expect(w.classes, "a class nobody is in must not be listed").toEqual([]);
  });

  it("brings both back when they are restored", async () => {
    if (skip()) return;
    for (const s of [stays, leaves]) {
      expect((await as(admin).post(`/api/students/${s.id}/restore`)).status).toBe(200);
    }

    const w = await workload();
    expect(w.students).toBe(2);
    expect(w.classes).toEqual(["8A"]);
  });
});
