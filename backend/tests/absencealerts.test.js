import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Telling a guardian, the same day, that their child was not in class.
 *
 * "Attendance alerts" has been a switch in Settings since notification
 * preferences were built — labelled *"Messages a guardian when their child is
 * marked absent"* — and `grep -rn attendanceAlerts src/` found exactly one hit:
 * its own definition. Nothing read it, and nothing was ever sent. A school could
 * reasonably believe parents were being told.
 *
 * No SMTP is configured here and none is faked, so what these pin is the part
 * that is actually verifiable: who gets told, who does not, and — the thing that
 * decides whether this is usable at all — that saving the register twice does
 * not tell anyone twice.
 *
 * A throwaway school, deleted in afterAll.
 */

let sa, admin, parent, instId, seeded = true;
let withGuardian, orphan;
const stamp = Date.now();
const PASSWORD = "AbsenceSpec123";

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};
const as = (t) => ({
  get: (u) => request(app).get(u).set("Authorization", `Bearer ${t}`),
  post: (u) => request(app).post(u).set("Authorization", `Bearer ${t}`),
  patch: (u) => request(app).patch(u).set("Authorization", `Bearer ${t}`),
});

let daySeq = 0;
/**
 * A school day nothing else in this spec has marked.
 *
 * These walk backwards from yesterday rather than sitting in a fixed future
 * month: attendance now refuses a future date, so the old 2033 dates would be
 * rejected before any of this spec's real subject — the guardian alert — was
 * ever reached. Only distinctness matters here; no test depends on the days
 * being consecutive or on their order.
 */
const nextDay = () =>
  new Date(Date.now() - ++daySeq * 86_400_000).toISOString().slice(0, 10);

const register = (date, records) =>
  as(admin).post("/api/attendance/bulk").send({ date, records });

beforeAll(async () => {
  sa = await login("sa@educonnect.io", "super123");
  if (!sa) { seeded = false; return; }

  const adminEmail = `absence.admin.${stamp}@test.edu`;
  const signup = await request(app).post("/api/auth/signup").send({
    name: `Absence School ${stamp}`, city: "Lahore", phone: "03001234567",
    email: `absence.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
    adminName: "Absence Admin", adminEmail, adminPassword: PASSWORD,
  });
  instId = signup.body.data?.institute?.id;
  if (!instId) { seeded = false; return; }
  await as(sa).patch(`/api/institutes/${instId}/status`).send({ status: "ACTIVE" });
  admin = await login(adminEmail);

  withGuardian = (await as(admin).post("/api/students").send({
    name: "Absence Ahmed", grade: "Grade 5", section: "A", rollNo: `AB-1-${stamp}`,
  })).body.data?.id;
  const sibling = (await as(admin).post("/api/students").send({
    name: "Absence Amna", grade: "Grade 3", section: "B", rollNo: `AB-2-${stamp}`,
  })).body.data?.id;
  orphan = (await as(admin).post("/api/students").send({
    name: "Absence Orphan", grade: "Grade 5", section: "A", rollNo: `AB-3-${stamp}`,
  })).body.data?.id;
  if (!withGuardian || !sibling || !orphan) { seeded = false; return; }

  const p = await as(admin).post("/api/parents").send({
    name: "Absence Parent", email: `absence.parent.${stamp}@test.edu`,
    phone: "03004444444", relation: "Father", createLogin: true,
    studentIds: [withGuardian, sibling],
  });
  parent = await login(
    `absence.parent.${stamp}@test.edu`,
    (p.body.message.match(/Temporary password: (\S+?)[\s)]/) ?? [])[1] ?? ""
  );
  global.__absenceSibling = sibling;
});

afterAll(async () => {
  if (instId) await prismaRaw.institute.delete({ where: { id: instId } }).catch(() => {});
  await prismaRaw.user.deleteMany({ where: { email: { contains: `.${stamp}@test.edu` } } }).catch(() => {});
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

/** Messages this spec's guardian actually received. */
const inbox = async () => {
  if (!parent) return [];
  const res = await as(parent).get("/api/messages?box=inbox&limit=100");
  return res.body.data ?? [];
};

describe("marking a register", () => {
  it("tells the guardian of a student who is newly absent", async () => {
    if (skip()) return;
    const before = (await inbox()).length;
    const date = nextDay();

    const res = await register(date, [{ studentId: withGuardian, status: "ABSENT" }]);
    expect(res.status).toBe(201);
    expect(res.body.data.absencesAnnounced).toBe(1);
    expect(res.body.data.guardiansNotified).toBe(1);
    expect(res.body.message).toMatch(/guardian/i);

    const after = await inbox();
    expect(after.length).toBe(before + 1);
    expect(after[0].subject).toMatch(/absent/i);
    expect(after[0].body).toContain("Absence Ahmed");

    /**
     * The date is the one fact in this message that has to be right — it is what
     * the parent will ask the child about. A school day is stored at UTC
     * midnight, so formatting it in the server's own zone moved it back one day:
     * a register saved for Wednesday told the guardian Tuesday.
     */
    const expected = new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    expect(after[0].subject).toContain(expected);
    // The day-of-month itself, so this fails loudly rather than agreeing with a
    // formatter that is wrong in the same direction as the code under test.
    expect(after[0].subject).toContain(String(Number(date.slice(8))));
  });

  /**
   * The whole point of a same-day alert is that it arrives once. A teacher
   * saving the register, spotting one wrong mark and saving again must not
   * re-announce the morning's absences.
   */
  it("does not tell them again when the register is saved a second time", async () => {
    if (skip()) return;
    const date = nextDay();
    await register(date, [{ studentId: withGuardian, status: "ABSENT" }]);
    const after1 = (await inbox()).length;

    const again = await register(date, [{ studentId: withGuardian, status: "ABSENT" }]);
    expect(again.body.data.absencesAnnounced).toBe(0);
    expect(again.body.data.guardiansNotified).toBe(0);
    expect((await inbox()).length).toBe(after1);
  });

  it("says nothing at all about a student who was present", async () => {
    if (skip()) return;
    const before = (await inbox()).length;
    const res = await register(nextDay(), [
      { studentId: withGuardian, status: "PRESENT" },
      { studentId: withGuardian === orphan ? withGuardian : orphan, status: "LATE" },
    ]);
    expect(res.body.data.absencesAnnounced).toBe(0);
    expect((await inbox()).length).toBe(before);
  });

  it("announces an absence that a correction introduces", async () => {
    if (skip()) return;
    const date = nextDay();
    await register(date, [{ studentId: withGuardian, status: "PRESENT" }]);
    const before = (await inbox()).length;

    // The teacher realises the child was not there after all.
    const fix = await register(date, [{ studentId: withGuardian, status: "ABSENT" }]);
    expect(fix.body.data.absencesAnnounced).toBe(1);
    expect((await inbox()).length).toBe(before + 1);
  });

  it("sends one message for two children absent the same day, not two", async () => {
    if (skip()) return;
    const before = (await inbox()).length;
    const res = await register(nextDay(), [
      { studentId: withGuardian, status: "ABSENT" },
      { studentId: global.__absenceSibling, status: "ABSENT" },
    ]);

    expect(res.body.data.absencesAnnounced).toBe(2);
    expect(res.body.data.guardiansNotified).toBe(1);

    const after = await inbox();
    expect(after.length).toBe(before + 1);
    expect(after[0].body).toContain("Absence Ahmed");
    expect(after[0].body).toContain("Absence Amna");
  });

  it("reports an absent student who has no guardian to tell", async () => {
    if (skip()) return;
    const res = await register(nextDay(), [{ studentId: orphan, status: "ABSENT" }]);
    expect(res.body.data.guardiansNotified).toBe(0);
    expect(res.body.data.guardiansMissing).toHaveLength(1);
    expect(res.body.data.guardiansMissing[0].student).toBe("Absence Orphan");
    expect(res.body.message).toMatch(/no guardian/i);
  });

  it("still saves the register, whatever happens to the alert", async () => {
    if (skip()) return;
    const date = nextDay();
    await register(date, [{ studentId: orphan, status: "ABSENT" }]);

    const row = await prismaRaw.attendance.findFirst({
      where: { studentId: orphan, date: new Date(`${date}T00:00:00.000Z`) },
    });
    expect(row?.status).toBe("ABSENT");
  });
});

describe("the Attendance alerts switch", () => {
  it("genuinely stops the alerts when it is off", async () => {
    if (skip()) return;
    const off = await as(admin).patch("/api/institutes/me/notifications")
      .send({ attendanceAlerts: false });
    expect(off.status).toBe(200);

    const before = (await inbox()).length;
    const res = await register(nextDay(), [{ studentId: withGuardian, status: "ABSENT" }]);

    expect(res.body.data.absencesAnnounced).toBe(1);
    expect(res.body.data.guardiansNotified).toBe(0);
    expect(res.body.message).toMatch(/not announced/i);
    expect((await inbox()).length).toBe(before);

    await as(admin).patch("/api/institutes/me/notifications").send({ attendanceAlerts: true });
  });

  it("resumes once it is switched back on", async () => {
    if (skip()) return;
    const before = (await inbox()).length;
    const res = await register(nextDay(), [{ studentId: withGuardian, status: "ABSENT" }]);
    expect(res.body.data.guardiansNotified).toBe(1);
    expect((await inbox()).length).toBe(before + 1);
  });
});

describe("marking one student", () => {
  it("tells the guardian too, and only once", async () => {
    if (skip()) return;
    const date = nextDay();
    const before = (await inbox()).length;

    const first = await as(admin).post("/api/attendance").send({
      studentId: withGuardian, date, status: "ABSENT",
    });
    expect(first.status).toBe(201);
    expect(first.body.data.guardiansNotified).toBe(1);

    const again = await as(admin).post("/api/attendance").send({
      studentId: withGuardian, date, status: "ABSENT",
    });
    expect(again.body.data.guardiansNotified).toBe(0);

    expect((await inbox()).length).toBe(before + 1);
  });
});

/**
 * What the register says it saved has to be what it saved.
 *
 * A register is unique on (student, day), so the same child sent twice writes
 * one row — but both were counted. A class of thirty came back as "31
 * student(s)", and a child sent PRESENT and then ABSENT was added to both
 * status totals while only the second was stored.
 */
describe("the counts a saved register reports", () => {
  it("counts a repeated student once, and reports the mark that was kept", async () => {
    if (skip()) return;
    const date = nextDay();

    const res = await register(date, [
      { studentId: withGuardian, status: "PRESENT" },
      { studentId: withGuardian, status: "ABSENT" },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.data.marked, "one child, one row").toBe(1);
    expect(res.body.message).toMatch(/1 student/);
    // Only the mark the upsert actually left behind is counted.
    expect(res.body.data.counts).toEqual({ ABSENT: 1 });

    const rows = await prismaRaw.attendance.findMany({
      where: { studentId: withGuardian, date: new Date(`${date}T00:00:00.000Z`) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ABSENT");
  });
});
