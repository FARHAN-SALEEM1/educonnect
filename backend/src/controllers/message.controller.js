import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { created, ok, paginate, pageMeta } from "../utils/response.js";
import { count } from "../utils/plural.js";

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true, role: true, avatarUrl: true } },
  recipient: { select: { id: true, name: true, role: true, avatarUrl: true } },
  student: { select: { id: true, name: true, grade: true, section: true } },
};

/** Adds the "Physics Teacher" / "School Office" style label the UI shows. */
const withRoleLabel = async (message) => {
  const label = async (user) => {
    if (!user) return null;
    if (user.role === "TEACHER") {
      const teacher = await prisma.teacher.findFirst({
        where: { userId: user.id },
        include: { subjects: { select: { name: true }, take: 1 } },
      });
      const subject = teacher?.subjects[0]?.name;
      return subject ? `${subject} Teacher` : "Teacher";
    }
    if (user.role === "ADMIN") return "School Office";
    if (user.role === "PARENT") return "Parent";
    return "Platform Admin";
  };

  return {
    ...message,
    fromRole: await label(message.sender),
    toRole: await label(message.recipient),
  };
};

/** GET /api/messages */
export const listMessages = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { box = "inbox", unreadOnly, search } = req.query;

  const mine =
    box === "sent"
      ? { senderId: req.user.id }
      : box === "all"
        ? { OR: [{ senderId: req.user.id }, { recipientId: req.user.id }] }
        : { recipientId: req.user.id };

  const where = {
    ...mine,
    ...(unreadOnly && { isRead: false, recipientId: req.user.id }),
    ...(search && {
      OR: [
        { subject: { contains: search, mode: "insensitive" } },
        { body: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [total, unread, messages] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.count({ where: { recipientId: req.user.id, isRead: false } }),
    prisma.message.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { ...MESSAGE_INCLUDE, _count: { select: { replies: true } } },
    }),
  ]);

  const data = await Promise.all(
    messages.map(async (m) => ({
      ...(await withRoleLabel(m)),
      replyCount: m._count.replies,
      _count: undefined,
    }))
  );

  return ok(res, data, "Messages fetched", { ...pageMeta(total, page, limit), unread });
});

/** GET /api/messages/:id — opening a message marks it read. */
export const getMessage = asyncHandler(async (req, res) => {
  const message = await prisma.message.findFirst({
    where: {
      id: req.params.id,
      OR: [{ senderId: req.user.id }, { recipientId: req.user.id }],
    },
    include: {
      ...MESSAGE_INCLUDE,
      replies: { include: MESSAGE_INCLUDE, orderBy: { createdAt: "asc" } },
      parent: { include: MESSAGE_INCLUDE },
    },
  });

  if (!message) throw ApiError.notFound("Message not found");

  if (message.recipientId === req.user.id && !message.isRead) {
    await prisma.message.update({
      where: { id: message.id },
      data: { isRead: true, readAt: new Date() },
    });
    message.isRead = true;
  }

  const replies = await Promise.all(message.replies.map(withRoleLabel));
  return ok(res, { ...(await withRoleLabel(message)), replies });
});

/**
 * GET /api/messages/contacts
 * Who the signed-in user is allowed to write to.
 *   PARENT  → their children's subject teachers + institute admins
 *   TEACHER → parents of their students + institute admins
 *   ADMIN   → every teacher and parent in the institute
 */
export const contacts = asyncHandler(async (req, res) => {
  const instituteId = req.user.instituteId;
  if (!instituteId) {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, name: true, role: true, email: true, instituteId: true },
      orderBy: { name: "asc" },
    });
    return ok(res, admins);
  }

  let userIds = [];

  if (req.user.role === "PARENT") {
    const subjects = await prisma.subject.findMany({
      where: { enrollments: { some: { student: { parentId: req.user.parentId } } } },
      include: { teacher: { select: { userId: true } } },
    });
    userIds = subjects.map((s) => s.teacher?.userId).filter(Boolean);
  } else if (req.user.role === "TEACHER") {
    const parents = await prisma.parent.findMany({
      where: {
        instituteId,
        students: { some: { enrollments: { some: { subject: { teacherId: req.user.teacherId } } } } },
      },
      select: { userId: true },
    });
    userIds = parents.map((p) => p.userId).filter(Boolean);
  }

  const where =
    req.user.role === "ADMIN"
      ? { instituteId, role: { in: ["TEACHER", "PARENT"] }, isActive: true }
      : {
          instituteId,
          isActive: true,
          OR: [{ id: { in: userIds } }, { role: "ADMIN" }],
        };

  const users = await prisma.user.findMany({
    where: { ...where, id: { not: req.user.id } },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return ok(res, users);
});

/** POST /api/messages */
export const sendMessage = asyncHandler(async (req, res) => {
  const { recipientId, subject, body, studentId, parentId } = req.body;

  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true, instituteId: true, isActive: true, name: true },
  });

  if (!recipient || !recipient.isActive) throw ApiError.notFound("Recipient not found");

  // Messaging never crosses institutes (the platform admin is the exception).
  if (req.user.role !== "SUPERADMIN" && recipient.instituteId !== req.user.instituteId) {
    throw ApiError.forbidden("You can only message people within your own institute");
  }

  /**
   * The child and guardian a message is about have to be this school's.
   *
   * These two ids came straight off the request body and went straight into
   * the row. `MESSAGE_INCLUDE` then hydrates the student back out, so anyone
   * holding a student id from another school — a parent, the lowest-privilege
   * role there is — could post a message to their own teacher and read that
   * child's name, grade and section out of the response. The row also kept a
   * foreign key pointing across the tenant boundary for good.
   *
   * Refused rather than quietly nulled: a caller attaching the wrong child
   * should be told, not have the attachment silently dropped.
   */
  const scope = req.user.instituteId ?? recipient.instituteId;

  if (studentId) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, instituteId: scope },
      select: { id: true },
    });
    if (!student) throw ApiError.badRequest("That student is not in this institute");
  }

  if (parentId) {
    const parent = await prisma.parent.findFirst({
      where: { id: parentId, instituteId: scope },
      select: { id: true },
    });
    if (!parent) throw ApiError.badRequest("That guardian is not in this institute");
  }

  const message = await prisma.message.create({
    data: {
      instituteId: scope,
      senderId: req.user.id,
      recipientId,
      subject,
      body,
      studentId: studentId ?? null,
      parentId: parentId ?? null,
    },
    include: MESSAGE_INCLUDE,
  });

  return created(res, await withRoleLabel(message), `Message sent to ${recipient.name}`);
});

/** POST /api/messages/:id/reply */
export const replyToMessage = asyncHandler(async (req, res) => {
  const original = await prisma.message.findFirst({
    where: {
      id: req.params.id,
      OR: [{ senderId: req.user.id }, { recipientId: req.user.id }],
    },
  });

  if (!original) throw ApiError.notFound("Message not found");

  // The reply goes back to whoever isn't the current user.
  const recipientId =
    original.senderId === req.user.id ? original.recipientId : original.senderId;

  const reply = await prisma.message.create({
    data: {
      instituteId: original.instituteId,
      senderId: req.user.id,
      recipientId,
      subject: original.subject.startsWith("Re:") ? original.subject : `Re: ${original.subject}`,
      body: req.body.body,
      parentId: original.id,
      studentId: original.studentId,
    },
    include: MESSAGE_INCLUDE,
  });

  return created(res, await withRoleLabel(reply), "Reply sent");
});

/** PATCH /api/messages/:id/read */
export const markRead = asyncHandler(async (req, res) => {
  const result = await prisma.message.updateMany({
    where: { id: req.params.id, recipientId: req.user.id },
    data: { isRead: true, readAt: new Date() },
  });

  if (!result.count) throw ApiError.notFound("Message not found in your inbox");
  return ok(res, null, "Marked as read");
});

/** PATCH /api/messages/read-all */
export const markAllRead = asyncHandler(async (req, res) => {
  const result = await prisma.message.updateMany({
    where: { recipientId: req.user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return ok(res, { updated: result.count }, `${count(result.count,"message")} marked as read`);
});

/** DELETE /api/messages/:id — only the sender may delete. */
export const deleteMessage = asyncHandler(async (req, res) => {
  const result = await prisma.message.deleteMany({
    where: { id: req.params.id, senderId: req.user.id },
  });

  if (!result.count) throw ApiError.notFound("Message not found, or you did not send it");
  return ok(res, null, "Message deleted");
});
