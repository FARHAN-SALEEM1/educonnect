/**
 * Timezone-correct calendar dates.
 *
 * Attendance and fee periods are *calendar* facts, not instants: "present on
 * 9 August" means the same thing regardless of where the server runs. Using
 * `new Date().setHours(0,0,0,0)` ties them to the server's clock, so a UTC
 * host serving a Pakistan school (UTC+5) files anything marked between
 * midnight and 5am to the previous day — and because Attendance is unique on
 * (studentId, date), that silently overwrites the day before.
 *
 * The fix: resolve the calendar date in the *institute's* timezone, then
 * store it as UTC midnight of that date. Prisma's @db.Date keeps only the
 * date part, so UTC midnight is a stable, unambiguous representation.
 */

export const DEFAULT_TIMEZONE = "Asia/Karachi";

/** Throws early if an institute is saved with a timezone Node doesn't know. */
export const isValidTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * The calendar date in `timeZone`, as "YYYY-MM-DD".
 * en-CA formats as YYYY-MM-DD, which is why it's used here.
 */
export const calendarDateIn = (timeZone = DEFAULT_TIMEZONE, at = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

/** UTC midnight of a "YYYY-MM-DD" string — how calendar dates are stored. */
export const dateOnly = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

/**
 * Normalises any incoming date to the stored form.
 *
 * A plain "YYYY-MM-DD" is already a calendar date and is taken at face value.
 * A full timestamp is converted to whatever calendar day it fell on *in the
 * institute's timezone* — so a client in Karachi sending 2026-08-09T02:00+05:00
 * gets 9 August, not 8 August.
 */
export const toStoredDate = (value, timeZone = DEFAULT_TIMEZONE) => {
  if (value instanceof Date) return dateOnly(calendarDateIn(timeZone, value));

  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return dateOnly(str);

  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return dateOnly(calendarDateIn(timeZone, parsed));
};

/** Today, in the institute's timezone, as a stored date. */
export const todayIn = (timeZone = DEFAULT_TIMEZONE) =>
  dateOnly(calendarDateIn(timeZone));

/** "2026-08" — the billing period a date falls in, institute-local. */
export const periodIn = (timeZone = DEFAULT_TIMEZONE, at = new Date()) =>
  calendarDateIn(timeZone, at).slice(0, 7);

/** Day-of-week for a stored date, 1 = Monday … 7 = Sunday (matches the schema). */
export const isoDayOfWeek = (date) => {
  const day = new Date(date).getUTCDay(); // stored dates are UTC midnight
  return day === 0 ? 7 : day;
};

/** N days before a stored date, still as a stored date. */
export const daysBefore = (storedDate, n) => {
  const d = new Date(storedDate);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};
