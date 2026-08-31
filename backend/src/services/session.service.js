import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * The academic session — the thing that turns "2026-27" into a span of days.
 *
 * Until now a session was a bare string on the institute, and the April-to-March
 * convention lived in a code comment. That left a whole class of question with
 * no answer: which session does this attendance row belong to, or this fee
 * period, or this mark? Nothing could say, because a session had no edges.
 *
 * Everything here exists to give it edges, per school. April-to-March is the
 * common Pakistani year and is what a new school gets, but a Karachi or
 * Cambridge-track school running August-to-July can set its own — and a school
 * that cannot state its own year cannot be handed a correct result card.
 */

/**
 * "2026-27" → { from: 2026, to: 2027 }, or null if it is not a year pair.
 *
 * The second half is checked against the year that follows rather than pasted
 * onto the first half's century — otherwise 2099-00 reads as the year 2000 and
 * a perfectly valid session name is rejected at the turn of a century.
 */
export const parseSessionName = (name) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(name ?? "").trim());
  if (!match) return null;

  const from = Number(match[1]);
  const to = from + 1;
  // A pair that does not advance by exactly one year is a typo, not a session.
  return String(to).slice(-2) === match[2] ? { from, to } : null;
};

/** The session that follows this one: "2026-27" → "2027-28". */
export const nextSessionName = (name) => {
  const parsed = parseSessionName(name);
  if (!parsed) return null;
  return `${parsed.to}-${String(parsed.to + 1).slice(-2)}`;
};

/**
 * The default span for a named session, given the month a school's year opens.
 *
 * A session named 2026-27 starting in April runs 1 Apr 2026 to 31 Mar 2027; the
 * same name starting in August runs 1 Aug 2026 to 31 Jul 2027. Dates are pinned
 * at UTC midnight, the same way `toStoredDate` pins a school day, so a server
 * in another zone cannot shift a boundary by a day.
 */
export const defaultSpan = (name, startMonth = 4) => {
  const parsed = parseSessionName(name);
  if (!parsed) return null;

  const startsOn = new Date(Date.UTC(parsed.from, startMonth - 1, 1));
  // The day before the same date a year later — 1 Apr 2026 → 31 Mar 2027.
  const endsOn = new Date(Date.UTC(parsed.from + 1, startMonth - 1, 1) - 86400000);
  return { startsOn, endsOn };
};

/** Which of these sessions contains a given date, or null. */
export const sessionForDate = (sessions, date) => {
  const t = new Date(date).getTime();
  return sessions.find((s) => t >= s.startsOn.getTime() && t <= s.endsOn.getTime()) ?? null;
};

/**
 * What a school would call the session a date falls in.
 *
 * `sessionForDate` needs the rows to exist; this needs only the school's start
 * month, so a date from before any session was recorded can still be named. It
 * is what lets a backfill say "these marks belong to 2025-26" about a year the
 * school has no row for yet — a derivation from the date itself, not a guess.
 *
 * Read in UTC, because a session's edges are pinned at UTC midnight and a
 * server in another zone must not move a July date into the previous year.
 */
export const sessionNameForDate = (date, startMonth = 4) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  // Before the opening month, the school is still in the year that began last
  // calendar year: March 2027 under an April school belongs to 2026-27.
  const from = d.getUTCMonth() + 1 >= startMonth ? year : year - 1;
  return `${from}-${String(from + 1).slice(-2)}`;
};

/** Every session a school has, newest first. */
export const listSessions = (instituteId) =>
  prisma.academicSession.findMany({
    where: { instituteId },
    orderBy: { startsOn: "desc" },
  });

/**
 * The session a school is running, without creating anything.
 *
 * Every list and every card reads this, and a read must never write: making
 * `GET /students` capable of inserting a row turned an ordinary listing into a
 * write that serialises against every other request for the same school. A
 * suite that had been running in seconds spent five minutes on one test.
 *
 * Returns null for a school that has no session recorded, which is not an error
 * — it is how the product behaved before sessions existed, and the callers fall
 * back to reading every year exactly as they used to.
 */
export const currentSession = (instituteId) => {
  /**
   * No school, no session — and never somebody else's.
   *
   * Prisma drops an `undefined` field from a where clause rather than
   * matching on it, so `{ instituteId: undefined, isCurrent: true }` asks for
   * the first current session of *any* institute in the database. On a route
   * that never ran scopeToInstitute that is exactly what happened: a teacher's
   * enrolments were filtered against another school's academic year, matched
   * nothing, and every teacher dashboard reported zero students. It only
   * shows up once a second school exists, which is to say only in production.
   */
  if (!instituteId) return Promise.resolve(null);
  return prisma.academicSession.findFirst({ where: { instituteId, isCurrent: true } });
};

/**
 * The `where` clause for one session, or nothing at all.
 *
 * Spreading `{}` is what makes an unscoped read the fallback. Writing
 * `academicSessionId: null` instead would match only the rows that have no
 * session, which is the opposite of what a school without sessions wants.
 */
export const sessionFilter = (sessionId) => (sessionId ? { academicSessionId: sessionId } : {});

/**
 * One session's enrolments, belonging to children still at the school.
 *
 * A removed student keeps their enrolments — that is what makes a restore put
 * everything back — and the soft-delete extension cannot help here, because
 * these are read as a nested `include` under Subject rather than as a
 * top-level Enrollment query. Without the filter a departed child kept
 * counting towards the teacher who taught them: four members of staff were
 * shown a class (9B) whose only student had been removed, and two more had
 * inflated rosters. The teacher's own student list, which goes through
 * `studentScopeWhere`, said something different again.
 */
export const liveEnrolmentFilter = (sessionId) => ({
  ...sessionFilter(sessionId),
  student: { deletedAt: null },
});

/**
 * Which session a request is about: the one it names, or the one the school is
 * running.
 *
 * Every screen that shows a student's work is implicitly about a year, and
 * until now that year was always "all of them". Defaulting to the current
 * session is what stops last year's marks appearing on this year's card; naming
 * one is what makes last year's card reachable at all.
 *
 * A name that the school has no record of is an error rather than an empty
 * result — asking for 2019-20 at a school founded in 2026 is a mistake worth
 * hearing about, not a card with nothing on it.
 */
export async function resolveSession(instituteId, name) {
  // Unnamed means "the year the school is running", read without writing. A
  // school with none recorded gets null and its callers stay unscoped.
  if (!name) return currentSession(instituteId);

  const session = await prisma.academicSession.findUnique({
    where: { instituteId_name: { instituteId, name: String(name).trim() } },
  });
  if (!session) {
    const known = await listSessions(instituteId);
    throw ApiError.notFound(
      known.length
        ? `This school has no session called "${name}". It has ${known.map((s) => s.name).join(", ")}.`
        : `This school has no session called "${name}".`
    );
  }
  return session;
}

/**
 * The fee periods that fall inside a session.
 *
 * `FeeInvoice.period` is a "YYYY-MM" string, which sorts correctly as text
 * because the month is zero-padded — so a range comparison needs no date
 * arithmetic and no list of every month in between. April-to-March gives
 * 2026-04 … 2027-03; a school opening in August gives 2026-08 … 2027-07.
 */
export const sessionPeriodRange = (session) => ({
  from: session.startsOn.toISOString().slice(0, 7),
  to: session.endsOn.toISOString().slice(0, 7),
});

/**
 * The session a newly created enrolment belongs to.
 *
 * Separate from `currentSession` on purpose: reading may look at any year and
 * must never write, but enrolling a student happens in the year the school is
 * actually running — and a new enrolment with no session would be invisible to
 * every session-scoped read, which is a worse failure than creating the row.
 * So this one is allowed to create, and only write paths call it.
 */
export async function currentSessionId(instituteId) {
  const session = await ensureCurrentSession(instituteId);
  return session.id;
}

/** The current session's id for a read path — never creates, may be null. */
export async function readSessionId(instituteId) {
  const session = await currentSession(instituteId);
  return session?.id ?? null;
}

/**
 * The session the school is running, creating it on first ask.
 *
 * Every institute already carries `currentSession` as a name, so the row can
 * always be reconstructed from what the school has been calling its year. That
 * is a fair derivation — it names the session the school itself named — and is
 * a different thing entirely from guessing which session a historical mark
 * belonged to, which nothing here does.
 */
export async function ensureCurrentSession(instituteId, { startMonth = 4 } = {}) {
  const existing = await prisma.academicSession.findFirst({
    where: { instituteId, isCurrent: true },
  });
  if (existing) return existing;

  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: { currentSession: true },
  });
  if (!institute) throw ApiError.notFound("Institute not found");

  const span = defaultSpan(institute.currentSession, startMonth);
  if (!span) {
    throw ApiError.badRequest(
      `"${institute.currentSession}" is not a session name this can date. Expected a year pair like 2026-27.`
    );
  }

  // A row may already exist under this name without being current — a school
  // that moved forward and then back. Adopt it rather than colliding with it.
  const named = await prisma.academicSession.findUnique({
    where: { instituteId_name: { instituteId, name: institute.currentSession } },
  });
  if (named) {
    return prisma.academicSession.update({
      where: { id: named.id },
      data: { isCurrent: true },
    });
  }

  return prisma.academicSession.create({
    data: { instituteId, name: institute.currentSession, ...span, isCurrent: true },
  });
}

/**
 * Moves a school into a session, creating it if it is new.
 *
 * `Institute.currentSession` and the session row's `isCurrent` are written in
 * one transaction, because the whole reason the string is still there is that it
 * mirrors this row. Two writers would let them drift, and a mirror that can
 * disagree with what it mirrors is worse than no mirror.
 */
export async function moveToSession(instituteId, name, { startMonth = 4, startsOn, endsOn } = {}) {
  const parsed = parseSessionName(name);
  if (!parsed) throw ApiError.badRequest("A session looks like 2027-28");

  const span =
    startsOn && endsOn
      ? { startsOn: new Date(startsOn), endsOn: new Date(endsOn) }
      : defaultSpan(name, startMonth);

  if (span.endsOn <= span.startsOn) {
    throw ApiError.badRequest("A session has to end after it starts");
  }

  return prisma.$transaction(async (tx) => {
    await tx.academicSession.updateMany({
      where: { instituteId, isCurrent: true },
      data: { isCurrent: false },
    });

    const session = await tx.academicSession.upsert({
      where: { instituteId_name: { instituteId, name } },
      create: { instituteId, name, ...span, isCurrent: true },
      // Dates of an existing session are left alone unless explicitly given —
      // moving back into a past year must not silently redraw its boundaries.
      update: { isCurrent: true, ...(startsOn && endsOn ? span : {}) },
    });

    await tx.institute.update({
      where: { id: instituteId },
      data: { currentSession: name },
    });

    return session;
  });
}

/** Adjusts one session's dates without changing which session is current. */
export async function reviseSessionDates(instituteId, sessionId, { startsOn, endsOn }) {
  const session = await prisma.academicSession.findFirst({
    where: { id: sessionId, instituteId },
  });
  if (!session) throw ApiError.notFound("Session not found");

  const from = startsOn ? new Date(startsOn) : session.startsOn;
  const to = endsOn ? new Date(endsOn) : session.endsOn;
  if (to <= from) throw ApiError.badRequest("A session has to end after it starts");

  /**
   * Sessions may not overlap.
   *
   * Overlapping years would make "which session does this date belong to"
   * ambiguous again, which is the exact problem this table exists to remove.
   */
  const clash = await prisma.academicSession.findFirst({
    where: {
      instituteId,
      id: { not: sessionId },
      startsOn: { lte: to },
      endsOn: { gte: from },
    },
    select: { name: true },
  });
  if (clash) {
    throw ApiError.badRequest(`Those dates overlap ${clash.name}. Sessions cannot overlap.`);
  }

  return prisma.academicSession.update({
    where: { id: sessionId },
    data: { startsOn: from, endsOn: to },
  });
}
