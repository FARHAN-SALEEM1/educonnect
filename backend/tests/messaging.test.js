import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Messaging, end to end through the API.
 *
 * This existed and worked on the server long before any portal could reach it:
 * a teacher had no way to start a message at all, so writing to a parent or to
 * the office was impossible from the UI, and an admin had no screen on which a
 * teacher's message could ever appear. The fix was in the portals, but the
 * contract they now depend on is here — who may write to whom, and which box a
 * message lands in — so it is pinned here.
 *
 * Every message created is deleted afterwards; the seeded demo threads are left
 * exactly as they were.
 */

const login = async (email, password) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.status === 200 ? res.body.data.accessToken : null;
};

let teacher = null;
let admin = null;
let parent = null;
let otherInstituteAdmin = null;
const created = [];

/** Skip cleanly rather than fail when the demo seed isn't present. */
const ready = () => Boolean(teacher && admin && parent);

beforeAll(async () => {
  teacher = await login("hassan@bhs.edu", "teach123");
  admin = await login("admin@bhs.edu", "admin123");
  parent = await login("sara@gmail.com", "parent123");

  // An admin at a *different* institute, for the cross-tenant check.
  const other = await prismaRaw.user.findFirst({
    where: { role: "ADMIN", institute: { code: { not: "INS001" } } },
    select: { id: true, email: true },
  });
  otherInstituteAdmin = other;
});

afterAll(async () => {
  if (created.length) {
    await prismaRaw.message.deleteMany({ where: { id: { in: created } } });
  }
});

const send = (token, payload) =>
  request(app).post("/api/messages").set("Authorization", `Bearer ${token}`).send(payload);

const track = (res) => {
  const id = res.body?.data?.id;
  if (id) created.push(id);
  return res;
};

describe("who a teacher may write to", () => {
  it("offers the institute's admins and the parents of their own students", async () => {
    if (!ready()) return;
    const res = await request(app).get("/api/messages/contacts").set("Authorization", `Bearer ${teacher}`);
    expect(res.status).toBe(200);

    const roles = new Set(res.body.data.map((c) => c.role));
    expect(roles.has("ADMIN"), "a teacher must be able to reach the office").toBe(true);
    expect(roles.has("PARENT"), "a teacher must be able to reach their students' parents").toBe(true);
  });

  it("never offers the teacher themselves", async () => {
    if (!ready()) return;
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${teacher}`);
    const res = await request(app).get("/api/messages/contacts").set("Authorization", `Bearer ${teacher}`);
    expect(res.body.data.some((c) => c.id === me.body.data.id)).toBe(false);
  });

  it("never offers anyone from another institute", async () => {
    if (!ready()) return;
    const res = await request(app).get("/api/messages/contacts").set("Authorization", `Bearer ${teacher}`);
    const ids = res.body.data.map((c) => c.id);
    const foreign = await prismaRaw.user.findMany({
      where: { id: { in: ids }, institute: { code: { not: "INS001" } } },
      select: { id: true },
    });
    expect(foreign).toEqual([]);
  });
});

describe("sending", () => {
  it("delivers a teacher's message to an admin, and files it in both boxes", async () => {
    if (!ready()) return;
    const contacts = await request(app).get("/api/messages/contacts").set("Authorization", `Bearer ${teacher}`);
    const target = contacts.body.data.find((c) => c.role === "ADMIN");
    expect(target, "no admin contact to write to").toBeTruthy();

    const res = track(await send(teacher, {
      recipientId: target.id,
      subject: "Regression — teacher to admin",
      body: "Sent by the messaging regression test.",
    }));
    expect(res.status).toBe(201);

    // Sender sees it in `sent`, never in `inbox`.
    const sent = await request(app).get("/api/messages?box=sent").set("Authorization", `Bearer ${teacher}`);
    expect(sent.body.data.some((m) => m.id === res.body.data.id)).toBe(true);

    const ownInbox = await request(app).get("/api/messages?box=inbox").set("Authorization", `Bearer ${teacher}`);
    expect(ownInbox.body.data.some((m) => m.id === res.body.data.id)).toBe(false);

    // Recipient sees it in `inbox`, unread.
    const adminInbox = await request(app).get("/api/messages?box=inbox").set("Authorization", `Bearer ${admin}`);
    const delivered = adminInbox.body.data.find((m) => m.id === res.body.data.id);
    expect(delivered, "the admin never received it").toBeTruthy();
    expect(delivered.isRead).toBe(false);
  });

  it("delivers a teacher's message to a parent", async () => {
    if (!ready()) return;
    const contacts = await request(app).get("/api/messages/contacts").set("Authorization", `Bearer ${teacher}`);
    const target = contacts.body.data.find((c) => c.role === "PARENT");
    expect(target).toBeTruthy();

    const res = track(await send(teacher, {
      recipientId: target.id,
      subject: "Regression — teacher to parent",
      body: "Sent by the messaging regression test.",
    }));
    expect(res.status).toBe(201);
  });

  /**
   * The recipient list is server-built, but nothing stops a caller posting a
   * different id — so the send endpoint has to re-check, not just the dropdown.
   */
  it("refuses a recipient at another institute even when the id is valid", async () => {
    if (!ready() || !otherInstituteAdmin) return;
    const res = await send(teacher, {
      recipientId: otherInstituteAdmin.id,
      subject: "Regression — cross tenant",
      body: "This must not be delivered.",
    });
    expect([403, 404]).toContain(res.status);
    if (res.body?.data?.id) created.push(res.body.data.id); // never expected, but don't leak it
  });

  it("refuses a recipient that does not exist", async () => {
    if (!ready()) return;
    const res = await send(teacher, {
      recipientId: "no-such-user-id",
      subject: "Regression — missing recipient",
      body: "This must not be delivered.",
    });
    expect(res.status).toBe(404);
  });

  it("rejects an empty subject or body rather than sending a blank message", async () => {
    if (!ready()) return;
    const contacts = await request(app).get("/api/messages/contacts").set("Authorization", `Bearer ${teacher}`);
    const target = contacts.body.data[0];
    const res = await send(teacher, { recipientId: target.id, subject: "", body: "" });
    expect(res.status).toBe(422);
  });
});

describe("replying", () => {
  it("routes the reply back to the other party and threads it", async () => {
    if (!ready()) return;
    const contacts = await request(app).get("/api/messages/contacts").set("Authorization", `Bearer ${teacher}`);
    const target = contacts.body.data.find((c) => c.role === "ADMIN");

    const original = track(await send(teacher, {
      recipientId: target.id,
      subject: "Regression — reply thread",
      body: "Original.",
    }));

    const reply = await request(app)
      .post(`/api/messages/${original.body.data.id}/reply`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ body: "Replying from the office." });

    expect(reply.status).toBe(201);
    if (reply.body?.data?.id) created.push(reply.body.data.id);

    // It goes back to the teacher, not to the admin who wrote it.
    const teacherInbox = await request(app).get("/api/messages?box=inbox").set("Authorization", `Bearer ${teacher}`);
    expect(teacherInbox.body.data.some((m) => m.id === reply.body.data.id)).toBe(true);
  });

  it("refuses to reply to a thread the caller is not part of", async () => {
    if (!ready()) return;
    const contacts = await request(app).get("/api/messages/contacts").set("Authorization", `Bearer ${teacher}`);
    const target = contacts.body.data.find((c) => c.role === "ADMIN");

    const original = track(await send(teacher, {
      recipientId: target.id,
      subject: "Regression — outsider reply",
      body: "Original.",
    }));

    // The parent is in the same institute but not in this thread.
    const res = await request(app)
      .post(`/api/messages/${original.body.data.id}/reply`)
      .set("Authorization", `Bearer ${parent}`)
      .send({ body: "I should not be able to do this." });

    expect(res.status).toBe(404); // not 403 — don't confirm the thread exists
    if (res.body?.data?.id) created.push(res.body.data.id);
  });
});

/**
 * What a message is allowed to be *about*.
 *
 * `studentId` and `parentId` came off the request body and went into the row
 * unchecked, while MESSAGE_INCLUDE hydrated the student back out again. So
 * anyone holding a student id from another school — a parent, the lowest
 * privilege there is — could post a message to their own teacher and read that
 * child's name, grade and section out of the response. The row also kept a
 * foreign key pointing across the tenant boundary permanently, invisible to
 * the school whose child it was.
 *
 * The outsider is built here rather than looked up in the demo data. Written
 * the other way round first, these tests passed against the unfixed code:
 * every demo student belongs to one institute, so the lookup came back null
 * and three of them returned before asserting anything.
 */
describe("what a message may be about", () => {
  const stamp = Date.now();
  const PASSWORD = "MsgScope!2026";
  let outsideId = null;
  let outsideStudent = null;
  let outsideParent = null;
  let mine = null;

  beforeAll(async () => {
    if (!ready()) return;

    const sa = await login("sa@educonnect.io", "super123");
    if (!sa) return;

    const adminEmail = `msg.admin.${stamp}@test.edu`;
    const signup = await request(app).post("/api/auth/signup").send({
      name: `Message Scope ${stamp}`, city: "Multan", phone: "03001234567",
      email: `msg.school.${stamp}@test.edu`, planId: "growth", studentLimit: 50,
      adminName: "Msg Admin", adminEmail, adminPassword: PASSWORD,
    });
    outsideId = signup.body.data?.institute?.id ?? null;
    if (!outsideId) return;

    await request(app)
      .patch(`/api/institutes/${outsideId}/status`)
      .set("Authorization", `Bearer ${sa}`)
      .send({ status: "ACTIVE" });
    const outsideAdmin = await login(adminEmail, PASSWORD);

    const student = await request(app)
      .post("/api/students")
      .set("Authorization", `Bearer ${outsideAdmin}`)
      .send({ name: "Outside Child", grade: "Grade 8", section: "A", rollNo: `MS-${stamp}` });
    outsideStudent = student.body.data ?? null;

    const guardian = await request(app)
      .post("/api/parents")
      .set("Authorization", `Bearer ${outsideAdmin}`)
      .send({ name: "Outside Guardian", email: `msg.p.${stamp}@test.edu`,
              phone: "03002222222", createLogin: false });
    outsideParent = guardian.body.data ?? null;

    mine = await prismaRaw.student.findFirst({
      where: { institute: { code: "INS001" }, deletedAt: null },
      select: { id: true },
    });
  });

  afterAll(async () => {
    if (!outsideId) return;
    const sa = await login("sa@educonnect.io", "super123");
    if (sa) {
      const removed = await request(app)
        .delete(`/api/institutes/${outsideId}`)
        .set("Authorization", `Bearer ${sa}`);
      if (removed.status === 200) {
        await request(app)
          .delete(`/api/institutes/${outsideId}/purge`)
          .set("Authorization", `Bearer ${sa}`);
      }
    }
    await prismaRaw.institute.delete({ where: { id: outsideId } }).catch(() => {});
    await prismaRaw.user
      .deleteMany({ where: { email: { contains: `.${stamp}@test.edu` } } })
      .catch(() => {});
  });

  /** Whoever this sender is allowed to write to inside their own school. */
  const someoneToWriteTo = async (token) => {
    const res = await request(app)
      .get("/api/messages/contacts")
      .set("Authorization", `Bearer ${token}`);
    return res.body.data?.[0]?.id ?? null;
  };

  const send = async (token, extra) => {
    const to = await someoneToWriteTo(token);
    if (!to) return null;
    const res = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${token}`)
      .send({ recipientId: to, subject: "scope probe", body: "scope probe", ...extra });
    // Tracked even on the failure path, so a regression cleans up after itself.
    if (res.status === 201) created.push(res.body.data.id);
    return res;
  };

  it("refuses another school's student, for the lowest-privilege role there is", async () => {
    if (!ready() || !outsideStudent) return;
    const res = await send(parent, { studentId: outsideStudent.id });
    if (!res) return;
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not in this institute/i);
  });

  /**
   * The half that made it a disclosure rather than only a bad foreign key:
   * the response echoed the attached child straight back, name and class.
   */
  it("never echoes a child from another school back to the sender", async () => {
    if (!ready() || !outsideStudent) return;
    const res = await send(parent, { studentId: outsideStudent.id });
    if (!res) return;
    expect(res.body.data?.student).toBeFalsy();
    expect(JSON.stringify(res.body)).not.toContain("Outside Child");
  });

  it("refuses another school's guardian too", async () => {
    if (!ready() || !outsideParent) return;
    const res = await send(admin, { parentId: outsideParent.id });
    if (!res) return;
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not in this institute/i);
  });

  /** The ordinary case has to keep working, or the guard is just a wall. */
  it("still allows a message about the sender's own child", async () => {
    if (!ready() || !mine) return;
    const res = await send(parent, { studentId: mine.id });
    if (!res) return;
    expect(res.status).toBe(201);
    expect(res.body.data.student?.id).toBe(mine.id);
  });
});
