import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { sendAbsenceAlert, notSent } from "./email.service.js";
import { notificationEnabled } from "../utils/notifications.js";

/**
 * Telling a guardian, the same day, that their child was not in class.
 *
 * The "Attendance alerts" toggle has existed in Settings since notification
 * preferences were built, described as "Messages a guardian when their child is
 * marked absent" — and nothing anywhere sent anything. The switch controlled
 * nothing, which is worse than not offering it: a school could believe parents
 * were being told.
 *
 * Two rules shape this:
 *
 *  1. **Only transitions into ABSENT are announced.** A teacher saving the
 *     register twice, or correcting one child's mark, must not send yesterday's
 *     news again. The caller passes the students whose stored status actually
 *     changed to ABSENT.
 *
 *  2. **One message per guardian, not per child.** A parent with two children
 *     absent on the same day gets one message listing both — the same shape the
 *     fee reminder settled on.
 *
 * Nothing here may fail the attendance write that triggered it. The register is
 * the record of truth; a notification that could not go out is a smaller
 * problem than a register that would not save.
 */
export async function alertGuardiansOfAbsence({ instituteId, studentIds, date, actorId }) {
  const quiet = { notified: 0, recipients: [], skipped: [], reason: null };
  if (!instituteId || !studentIds?.length) return quiet;

  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: { name: true, notificationSettings: true },
  });
  if (!institute) return quiet;

  // Enforced here, not only in the UI — turning the toggle off genuinely stops
  // the alerts, including for a caller hitting the API directly.
  if (!notificationEnabled(institute, "attendanceAlerts")) {
    return { ...quiet, reason: "attendance-alerts-off" };
  }

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, instituteId },
    select: {
      id: true,
      name: true,
      grade: true,
      section: true,
      parent: {
        select: {
          id: true,
          name: true,
          email: true,
          user: { select: { id: true, isActive: true } },
        },
      },
    },
  });

  const byParent = new Map();
  const skipped = [];

  for (const s of students) {
    if (!s.parent) {
      skipped.push({ student: s.name, reason: "no guardian linked" });
      continue;
    }
    if (!byParent.has(s.parent.id)) byParent.set(s.parent.id, { parent: s.parent, children: [] });
    byParent.get(s.parent.id).children.push(s);
  }

  /**
   * Formatted in UTC, because that is where the school day is stored.
   *
   * `toStoredDate` pins a school's day to UTC midnight. Rendering that in the
   * server's own zone moves it: a register saved for Wednesday told the guardian
   * their child was absent on Tuesday — the one fact in the message that has to
   * be right, since it is what the parent will ask the child about.
   */
  const readable = new Date(date).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const recipients = [];

  for (const { parent, children } of byParent.values()) {
    const many = children.length > 1;
    const list = children.map((c) => `• ${c.name} — ${c.grade} ${c.section}`).join("\n");
    const subject = `Absent on ${readable}`;
    const body =
      `Dear ${parent.name},\n\nThe following ${many ? "children were" : "child was"} marked absent at ` +
      `${institute.name} on ${readable}:\n\n${list}\n\n` +
      `If the school already knows the reason, please ignore this message. Otherwise kindly ` +
      `inform the class teacher or the school office.`;

    // In-app message only where the guardian actually has a login.
    let messaged = false;
    if (parent.user?.id && parent.user.isActive && actorId) {
      await prisma.message
        .create({
          data: {
            instituteId,
            senderId: actorId,
            recipientId: parent.user.id,
            subject,
            body,
            studentId: children[0].id,
          },
        })
        .then(() => {
          messaged = true;
        })
        .catch(() => {
          /* a failed message must not fail the register */
        });
    }

    const delivery = parent.email
      ? await sendAbsenceAlert({
          to: parent.email,
          name: parent.name,
          instituteName: institute.name,
          date: readable,
          students: children,
        }).catch(() => notSent("delivery-failed"))
      : notSent("no-email");

    recipients.push({
      parent: parent.name,
      email: parent.email,
      students: children.length,
      messaged,
      emailed: delivery.delivered,
    });
  }

  return { notified: recipients.length, recipients, skipped, reason: null };
}

/**
 * Which of these students are newly absent.
 *
 * Compares what is about to be written against what is stored, so re-saving a
 * register announces nothing. A student with no stored row yet counts as a
 * change — that is the first time anyone has said they were absent.
 */
export async function newlyAbsent({ records, date }) {
  const absent = records.filter((r) => r.status === "ABSENT").map((r) => r.studentId);
  if (!absent.length) return [];

  const existing = await prisma.attendance.findMany({
    where: { studentId: { in: absent }, date },
    select: { studentId: true, status: true },
  });

  const already = new Set(existing.filter((e) => e.status === "ABSENT").map((e) => e.studentId));
  return absent.filter((id) => !already.has(id));
}

/** Where a guardian goes to see the register. Kept beside the copy that uses it. */
export const attendanceUrl = () => `${env.appUrl}/`;
