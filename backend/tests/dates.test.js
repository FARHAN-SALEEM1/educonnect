import { describe, expect, it } from "vitest";
import {
  calendarDateIn,
  daysBefore,
  isValidTimeZone,
  isoDayOfWeek,
  periodIn,
  toStoredDate,
} from "../src/utils/dates.js";

/**
 * Regression cover for the bug these helpers exist to fix: a UTC-hosted API
 * serving a UTC+5 school filed early-morning attendance to the previous day,
 * silently overwriting it because Attendance is unique on (studentId, date).
 */

describe("calendarDateIn", () => {
  it("returns the local calendar date, not the UTC one", () => {
    // 21:00 UTC on 8 Aug is already 02:00 on 9 Aug in Karachi (UTC+5).
    const at = new Date("2026-08-08T21:00:00.000Z");
    expect(calendarDateIn("UTC", at)).toBe("2026-08-08");
    expect(calendarDateIn("Asia/Karachi", at)).toBe("2026-08-09");
  });

  it("handles zones behind UTC too", () => {
    // 02:00 UTC on 9 Aug is still 22:00 on 8 Aug in New York.
    const at = new Date("2026-08-09T02:00:00.000Z");
    expect(calendarDateIn("America/New_York", at)).toBe("2026-08-08");
  });
});

describe("toStoredDate", () => {
  it("stores a plain YYYY-MM-DD at face value", () => {
    expect(toStoredDate("2026-08-09", "Asia/Karachi").toISOString()).toBe(
      "2026-08-09T00:00:00.000Z"
    );
  });

  it("resolves a timestamp to the school's calendar day", () => {
    // The exact case that used to lose a day.
    const earlyMorningInKarachi = "2026-08-08T21:30:00.000Z";
    expect(toStoredDate(earlyMorningInKarachi, "Asia/Karachi").toISOString()).toBe(
      "2026-08-09T00:00:00.000Z"
    );
    expect(toStoredDate(earlyMorningInKarachi, "UTC").toISOString()).toBe(
      "2026-08-08T00:00:00.000Z"
    );
  });

  it("is idempotent — storing a stored date changes nothing", () => {
    const once = toStoredDate("2026-08-09", "Asia/Karachi");
    const twice = toStoredDate(once, "Asia/Karachi");
    expect(twice.toISOString()).toBe(once.toISOString());
  });

  it("rejects an unparseable date instead of storing Invalid Date", () => {
    expect(() => toStoredDate("not-a-date", "UTC")).toThrow(/Invalid date/);
  });
});

describe("isoDayOfWeek", () => {
  it("uses 1 = Monday … 7 = Sunday, matching the timetable schema", () => {
    expect(isoDayOfWeek(new Date("2026-08-10T00:00:00.000Z"))).toBe(1); // Monday
    expect(isoDayOfWeek(new Date("2026-08-14T00:00:00.000Z"))).toBe(5); // Friday
    expect(isoDayOfWeek(new Date("2026-08-15T00:00:00.000Z"))).toBe(6); // Saturday
    expect(isoDayOfWeek(new Date("2026-08-09T00:00:00.000Z"))).toBe(7); // Sunday
  });
});

describe("daysBefore", () => {
  it("steps back in whole days and crosses month boundaries", () => {
    expect(daysBefore(new Date("2026-08-09T00:00:00.000Z"), 30).toISOString()).toBe(
      "2026-07-10T00:00:00.000Z"
    );
  });

  it("does not mutate the input", () => {
    const d = new Date("2026-08-09T00:00:00.000Z");
    daysBefore(d, 5);
    expect(d.toISOString()).toBe("2026-08-09T00:00:00.000Z");
  });
});

describe("periodIn", () => {
  it("derives the billing month from the school's timezone", () => {
    // 31 Jul 21:00 UTC is already 1 Aug in Karachi — a month boundary.
    const at = new Date("2026-07-31T21:00:00.000Z");
    expect(periodIn("UTC", at)).toBe("2026-07");
    expect(periodIn("Asia/Karachi", at)).toBe("2026-08");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Asia/Karachi")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
