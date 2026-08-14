/**
 * Per-institute notification preferences.
 *
 * These were toggle switches in the UI that controlled nothing. They now
 * gate the corresponding action server-side, so turning one off actually
 * stops the notification rather than just moving a switch.
 *
 * Stored as JSON on Institute so adding a preference needs no migration.
 */

export const NOTIFICATION_PREFS = [
  {
    key: "feeReminders",
    label: "Fee reminders to parents",
    description: "Sends guardians a reminder listing their unpaid invoices.",
    default: true,
    // What actually checks this, so the UI can say so plainly.
    controls: "POST /api/fees/remind",
  },
  {
    key: "attendanceAlerts",
    label: "Attendance alerts",
    description: "Messages a guardian when their child is marked absent.",
    default: true,
    controls: "Marking a student absent",
  },
  {
    key: "noticeEmails",
    label: "Email notices to parents",
    description: "Emails a copy of each published notice to guardians.",
    default: false,
    controls: "Publishing a notice",
  },
  {
    key: "welcomeEmails",
    label: "Welcome emails",
    description: "Emails sign-in details when a teacher or parent account is created.",
    default: true,
    controls: "Creating a teacher or parent",
  },
];

const DEFAULTS = Object.fromEntries(NOTIFICATION_PREFS.map((p) => [p.key, p.default]));

/** Merges stored settings over the defaults, ignoring unknown keys. */
export const notificationSettings = (institute) => {
  const stored = institute?.notificationSettings ?? {};
  const result = { ...DEFAULTS };
  for (const { key } of NOTIFICATION_PREFS) {
    if (typeof stored[key] === "boolean") result[key] = stored[key];
  }
  return result;
};

/** Is this notification enabled for the institute? Defaults win when unset. */
export const notificationEnabled = (institute, key) => notificationSettings(institute)[key] ?? false;

/** Validates an incoming patch, returning only known boolean keys. */
export const sanitizeNotificationSettings = (input) => {
  const clean = {};
  for (const { key } of NOTIFICATION_PREFS) {
    if (typeof input?.[key] === "boolean") clean[key] = input[key];
  }
  return clean;
};
