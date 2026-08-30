import { describe, expect, it } from "vitest";
import { sweep, simulate, total, minutes, overlaps } from "../scripts/fix-timetable-conflicts.js";

/**
 * The repair script's conflict logic, tested against timetables built here.
 *
 * The script's plan is fixed — it always exchanges Grade 9-B's English and
 * Urdu — which is exactly the move that clears the nine conflicts the seed
 * shipped with, and exactly the move that re-creates them if it runs again on
 * a timetable it has already fixed. That is what these pin: a plan is only
 * committed when it lowers the conflict count, so a second `--apply` is a
 * no-op rather than an undo.
 *
 * Nothing here touches the database. `sweep` and `simulate` are pure, and the
 * script only sweeps when it is invoked directly.
 */

const slot = (over) => ({
  id: `s${Math.random().toString(36).slice(2, 9)}`,
  dayOfWeek: 1,
  period: 1,
  startTime: "08:00",
  endTime: "08:45",
  grade: "Grade 8",
  section: "A",
  teacherId: null,
  room: null,
  subject: { name: "Maths" },
  teacher: { name: "Someone" },
  ...over,
});

/** 9-B's English and Urdu, sitting where 8-A uses the same two teachers. */
const clashingDay = () => {
  const english8 = slot({ grade: "Grade 8", section: "A", period: 1, startTime: "08:00", endTime: "08:45", teacherId: "ali", subject: { name: "English" } });
  const urdu8 = slot({ grade: "Grade 8", section: "A", period: 2, startTime: "08:45", endTime: "09:30", teacherId: "tariq", subject: { name: "Urdu" } });
  const english9 = slot({ grade: "Grade 9", section: "B", period: 1, startTime: "08:00", endTime: "08:45", teacherId: "ali", subject: { name: "English" } });
  const urdu9 = slot({ grade: "Grade 9", section: "B", period: 2, startTime: "08:45", endTime: "09:30", teacherId: "tariq", subject: { name: "Urdu" } });
  return { slots: [english8, urdu8, english9, urdu9], english: english9, urdu: urdu9 };
};

describe("minutes and overlaps", () => {
  it("reads a wall clock", () => {
    expect(minutes("08:00")).toBe(480);
    expect(minutes("12:05")).toBe(725);
    expect(minutes("")).toBeNull();
    expect(minutes(null)).toBeNull();
    expect(minutes("garbage")).toBeNull();
  });

  it("treats periods as half-open, so back-to-back lessons do not clash", () => {
    // 08:00-09:00 and 09:00-10:00 touch but do not overlap.
    expect(overlaps(480, 540, 540, 600)).toBe(false);
    expect(overlaps(480, 540, 530, 600)).toBe(true);
    expect(overlaps(480, 540, 480, 540)).toBe(true);
  });
});

describe("sweep", () => {
  it("finds a teacher booked into two rooms at once", () => {
    const { slots } = clashingDay();
    const found = sweep(slots);
    expect(found.teacher.length).toBe(2); // ali and tariq, once each
    expect(found.class.length).toBe(0);
    expect(found.room.length).toBe(0);
  });

  it("ignores a clash on a different day", () => {
    const a = slot({ teacherId: "ali", dayOfWeek: 1 });
    const b = slot({ teacherId: "ali", dayOfWeek: 2 });
    expect(total(sweep([a, b]))).toBe(0);
  });

  it("counts two lessons for one class at one time as a class clash", () => {
    const a = slot({ grade: "Grade 8", section: "A", teacherId: "x" });
    const b = slot({ grade: "Grade 8", section: "A", teacherId: "y" });
    expect(sweep([a, b]).class.length).toBe(1);
  });

  it("does not call one class's own room a room clash", () => {
    const a = slot({ grade: "Grade 8", section: "A", room: "Room 3", teacherId: "x" });
    const b = slot({ grade: "Grade 8", section: "A", room: "Room 3", teacherId: "y" });
    expect(sweep([a, b]).room.length).toBe(0);
  });

  it("matches room names case-insensitively across classes", () => {
    const a = slot({ grade: "Grade 8", section: "A", room: "Room 3", teacherId: "x" });
    const b = slot({ grade: "Grade 9", section: "B", room: "room 3", teacherId: "y" });
    expect(sweep([a, b]).room.length).toBe(1);
  });

  it("falls back to the period when a slot carries no times", () => {
    const a = slot({ startTime: null, endTime: null, period: 3, teacherId: "ali" });
    const b = slot({ startTime: null, endTime: null, period: 3, teacherId: "ali" });
    const c = slot({ startTime: null, endTime: null, period: 4, teacherId: "ali" });
    expect(sweep([a, b]).teacher.length).toBe(1);
    expect(sweep([a, c]).teacher.length).toBe(0);
  });
});

describe("the swap plan", () => {
  it("clears the conflicts it was written for", () => {
    const { slots, english, urdu } = clashingDay();
    expect(total(sweep(slots))).toBe(2);

    const after = simulate(slots, [{ english, urdu }]);
    expect(total(sweep(after))).toBe(0);
  });

  it("moves only period and times — never subject, teacher, class or day", () => {
    const { slots, english, urdu } = clashingDay();
    const after = simulate(slots, [{ english, urdu }]);
    const movedEnglish = after.find((s) => s.id === english.id);

    expect(movedEnglish.period).toBe(urdu.period);
    expect(movedEnglish.startTime).toBe(urdu.startTime);
    expect(movedEnglish.subject.name).toBe("English");
    expect(movedEnglish.teacherId).toBe("ali");
    expect(movedEnglish.grade).toBe("Grade 9");
    expect(movedEnglish.section).toBe("B");
    expect(movedEnglish.dayOfWeek).toBe(english.dayOfWeek);
  });

  it("creates and destroys nothing", () => {
    const { slots, english, urdu } = clashingDay();
    const after = simulate(slots, [{ english, urdu }]);
    expect(after.length).toBe(slots.length);
    expect(new Set(after.map((s) => s.id))).toEqual(new Set(slots.map((s) => s.id)));
  });

  /**
   * The bug this whole change is about. The plan is its own inverse, so
   * running it on an already-fixed timetable puts every conflict back.
   */
  it("would undo itself if it were applied a second time", () => {
    const { slots, english, urdu } = clashingDay();
    const once = simulate(slots, [{ english, urdu }]);
    expect(total(sweep(once))).toBe(0);

    const twice = simulate(once, [
      { english: once.find((s) => s.id === english.id), urdu: once.find((s) => s.id === urdu.id) },
    ]);
    expect(total(sweep(twice))).toBe(2); // straight back to where it started
  });

  it("is refused by the improvement check the second time", () => {
    const { slots, english, urdu } = clashingDay();
    const clean = simulate(slots, [{ english, urdu }]);

    // What the script now asks before writing: does this plan lower the count?
    const beforeCount = total(sweep(clean));
    const pairs = [
      { english: clean.find((s) => s.id === english.id), urdu: clean.find((s) => s.id === urdu.id) },
    ];
    const predicted = total(sweep(simulate(clean, pairs)));

    expect(beforeCount).toBe(0);
    expect(predicted).toBeGreaterThanOrEqual(beforeCount); // so the script refuses
  });

  it("leaves an unrelated conflict alone rather than shuffling rows for nothing", () => {
    // Two Grade 8 teachers double-booked; 9-B English/Urdu are not involved.
    const a = slot({ grade: "Grade 8", section: "A", period: 1, teacherId: "hassan" });
    const b = slot({ grade: "Grade 7", section: "C", period: 1, teacherId: "hassan" });
    const english9 = slot({ grade: "Grade 9", section: "B", period: 4, startTime: "10:15", endTime: "11:00", teacherId: "ali", subject: { name: "English" } });
    const urdu9 = slot({ grade: "Grade 9", section: "B", period: 5, startTime: "11:20", endTime: "12:05", teacherId: "tariq", subject: { name: "Urdu" } });
    const slots = [a, b, english9, urdu9];

    const before = total(sweep(slots));
    expect(before).toBe(1);

    const predicted = total(sweep(simulate(slots, [{ english: english9, urdu: urdu9 }])));
    // No improvement, so the script refuses and writes nothing.
    expect(predicted).toBeGreaterThanOrEqual(before);
  });
});
