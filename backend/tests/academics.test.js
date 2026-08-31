import { describe, expect, it } from "vitest";
import {
  assessmentAverage,
  attendanceSummary,
  averageScore,
  classRank,
  gradePoint,
  letterGrade,
  periodLabel,
  predictScore,
} from "../src/utils/academics.js";
import { DEFAULT_PASSING } from "../src/utils/grading.js";

/**
 * These pure functions produce every number a parent sees on a report card,
 * so their boundaries are worth pinning down explicitly.
 */

describe("letterGrade", () => {
  /**
   * The platform default is the board scale, and its floor is the pass mark:
   * F stops at 33 because a school given this scale on day one must not be
   * told a passing child failed.
   */
  it("maps each band to its letter", () => {
    expect(letterGrade(100)).toBe("A+");
    expect(letterGrade(80)).toBe("A+");
    expect(letterGrade(79)).toBe("A");
    expect(letterGrade(70)).toBe("A");
    expect(letterGrade(69)).toBe("B");
    expect(letterGrade(50)).toBe("C");
    expect(letterGrade(40)).toBe("D");
    expect(letterGrade(33)).toBe("E");
    expect(letterGrade(32)).toBe("F");
    expect(letterGrade(0)).toBe("F");
  });

  it("is inclusive at the lower edge of every band", () => {
    // A student on exactly 80 must get the higher grade, not the lower one.
    expect(letterGrade(80)).toBe("A+");
    expect(letterGrade(79.99)).toBe("A");
  });

  /**
   * The scale these three read is the fallback for a caller with no school
   * in hand. Anything answering about a particular school reads that
   * school's own bands through policyFor().
   */
  it("never grades a passing mark F", () => {
    expect(letterGrade(DEFAULT_PASSING)).not.toBe("F");
    expect(letterGrade(DEFAULT_PASSING - 1)).toBe("F");
  });

  it("returns null when there is no score rather than inventing an F", () => {
    expect(letterGrade(null)).toBeNull();
    expect(letterGrade(undefined)).toBeNull();
  });
});

describe("gradePoint", () => {
  it("caps at 4.0 and floors at 0", () => {
    expect(gradePoint(100)).toBe(4.0);
    expect(gradePoint(85)).toBe(4.0);
    expect(gradePoint(10)).toBe(0);
  });

  it("treats a missing score as 0, not as full marks", () => {
    expect(gradePoint(null)).toBe(0);
  });
});

describe("averageScore", () => {
  it("averages only scored subjects", () => {
    expect(averageScore([{ currentScore: 90 }, { currentScore: 80 }])).toBe(85);
    expect(averageScore([{ currentScore: 90 }, { currentScore: null }])).toBe(90);
  });

  it("returns 0 rather than NaN when nothing is scored", () => {
    expect(averageScore([])).toBe(0);
  });
});

describe("predictScore", () => {
  it("projects the term-over-term trend, damped to 60%", () => {
    // Up 10 → +6
    expect(predictScore(80, 70)).toBe(86);
    // Down 10 → -6
    expect(predictScore(70, 80)).toBe(64);
  });

  it("clamps to 0-100 so a strong run can't predict an impossible score", () => {
    expect(predictScore(98, 80)).toBe(100);
    expect(predictScore(5, 40)).toBe(0);
  });

  it("returns the current score when there is no previous term", () => {
    expect(predictScore(77, null)).toBe(77);
  });

  it("returns null with no current score", () => {
    expect(predictScore(null, 60)).toBeNull();
  });
});

describe("assessmentAverage", () => {
  it("weights by total marks, not by assessment count", () => {
    // 18/20 and 45/50 → 63/70 = 90%
    expect(assessmentAverage([
      { obtained: 18, total: 20 },
      { obtained: 45, total: 50 },
    ])).toBe(90);
  });

  it("returns null with no assessments so the score isn't reset to zero", () => {
    expect(assessmentAverage([])).toBeNull();
  });

  it("guards against a zero-mark denominator", () => {
    expect(assessmentAverage([{ obtained: 0, total: 0 }])).toBeNull();
  });
});

describe("attendanceSummary", () => {
  const rows = (counts) =>
    Object.entries(counts).flatMap(([status, n]) => Array.from({ length: n }, () => ({ status })));

  it("counts a late arrival as attendance for the headline rate", () => {
    const s = attendanceSummary(rows({ PRESENT: 80, ABSENT: 10, LATE: 10 }));
    expect(s.present).toBe(80);
    expect(s.late).toBe(10);
    expect(s.rate).toBe(90); // present + late
  });

  it("returns a zero rate for no records rather than dividing by zero", () => {
    expect(attendanceSummary([])).toEqual({
      present: 0, absent: 0, late: 0, leave: 0, total: 0, rate: 0,
    });
  });
});

describe("classRank", () => {
  const cohort = [
    { studentId: "a", average: 72 },
    { studentId: "b", average: 91 },
    { studentId: "c", average: 85 },
  ];

  it("ranks by average, highest first", () => {
    expect(classRank(cohort, "b")).toEqual({ rank: 1, classSize: 3 });
    expect(classRank(cohort, "c")).toEqual({ rank: 2, classSize: 3 });
    expect(classRank(cohort, "a")).toEqual({ rank: 3, classSize: 3 });
  });

  it("does not mutate the caller's array", () => {
    const original = [...cohort];
    classRank(cohort, "a");
    expect(cohort).toEqual(original);
  });

  it("returns a null rank for someone outside the cohort", () => {
    expect(classRank(cohort, "zzz").rank).toBeNull();
  });
});

describe("periodLabel", () => {
  it("formats a period key for display", () => {
    expect(periodLabel("2026-03")).toBe("Mar 2026");
    expect(periodLabel("2026-12")).toBe("Dec 2026");
    expect(periodLabel("2026-01")).toBe("Jan 2026");
  });
});
