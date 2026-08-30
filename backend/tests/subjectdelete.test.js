import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Deleting a subject used to delete every mark ever recorded in it.
 *
 *     Subject  --Cascade-->  Enrollment  --Cascade-->  Assessment
 *
 * `Subject` is not one of the soft-deleted models and has no recycle bin, so
 * an admin tidying up — "we stopped teaching Computer Sc." — erased that
 * subject's marks for every student, in every year, with no way back. The
 * response only ever mentioned enrolments, so nothing said the marks had gone.
 *
 * It was the only hard delete in the product that reached academic records.
 * Teacher and ExamTerm null their references, a session is Restricted by its
 * enrolments, and students and institutes are soft-deleted.
 *
 * The refusal has to stay narrow: a subject created by mistake, with nothing
 * recorded against it, must still be removable — otherwise the guard just
 * trades one problem for another.
 *
 * A throwaway school, deleted in afterAll.
 */

const stamp = Date.now();
const PASSWORD = "SubjectDel123";

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

let sa, admin, instId, student, taught, untaught;
let seeded = true;

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) {
    seeded = false;
    return;
  }

  const adminEmail = `subdel.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Subject Delete School ${stamp}`,
    city: "Lahore",
    phone: "03001234567",
    email: `subdel.school.${stamp}@test.edu`,
    planId: "growth",
    studentLimit: 50,
    adminName: "SubDel Admin",
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
      name: "Subject Student",
      grade: "Grade 8",
      section: "A",
      rollNo: `SD-${stamp}`,
    })
  ).body.data;

  // One subject that has been taught and marked, one that never was.
  taught = (
    await as(admin).post("/api/subjects").send({
      name: "Mathematics",
      grade: "Grade 8",
      code: `SD-M-${stamp}`,
    })
  ).body.data;
  untaught = (
    await as(admin).post("/api/subjects").send({
      name: "Astronomy",
      grade: "Grade 8",
      code: `SD-A-${stamp}`,
    })
  ).body.data;
  if (!student || !taught || !untaught) {
    seeded = false;
    return;
  }

  await as(admin)
    .post("/api/subjects/enroll")
    .send({ studentId: student.id, subjectId: taught.id });
  const mark = await as(admin).post("/api/assessments").send({
    studentId: student.id,
    subjectId: taught.id,
    title: "Mid Term",
    type: "EXAM",
    obtained: 82,
    total: 100,
  });
  if (mark.status !== 201) seeded = false;
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

const marksFor = (subjectId) =>
  prismaRaw.assessment.count({ where: { enrollment: { subjectId } } });

describe("deleting a subject that has been marked", () => {
  it("is refused", async () => {
    if (skip()) return;
    const res = await as(admin).delete(`/api/subjects/${taught.id}`);

    expect(res.status).toBe(409);
  });

  it("says what would have been lost, and what to do instead", async () => {
    if (skip()) return;
    const res = await as(admin).delete(`/api/subjects/${taught.id}`);

    expect(res.body.message).toContain("Mathematics");
    expect(res.body.message).toMatch(/result card/i);
    // The admin is not left stuck: the message names the alternative.
    expect(res.body.message).toMatch(/left in place/i);
  });

  it("destroys nothing on the way to refusing", async () => {
    if (skip()) return;
    await as(admin).delete(`/api/subjects/${taught.id}`);

    expect(await marksFor(taught.id), "the mark must survive").toBe(1);
    expect(
      await prismaRaw.enrollment.count({ where: { subjectId: taught.id } })
    ).toBe(1);
    expect(
      await prismaRaw.subject.findUnique({ where: { id: taught.id } })
    ).not.toBeNull();
  });

  it("still shows the mark on the student's report", async () => {
    if (skip()) return;
    const res = await as(admin).get(`/api/students/${student.id}/report`);

    const subjects = res.body.data?.subjects ?? [];
    expect(subjects.some((s) => s.name === "Mathematics")).toBe(true);
  });
});

describe("deleting a subject nothing was ever recorded against", () => {
  it("still works, so a mistake can be cleaned up", async () => {
    if (skip()) return;
    const res = await as(admin).delete(`/api/subjects/${untaught.id}`);

    expect(res.status, res.body.message).toBe(200);
    expect(
      await prismaRaw.subject.findUnique({ where: { id: untaught.id } })
    ).toBeNull();
  });
});
