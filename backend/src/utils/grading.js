/**
 * A school's own grading policy.
 *
 * The bands and the pass mark used to be a module constant — one scale for
 * every school on the platform. No two Pakistani schools agree on it: some put
 * A+ at 90 and some at 80, some stop at A/B/C, the boards have their own, and
 * the pass mark is 33% in most of the country and 40% in a good many private
 * schools. A multi-tenant product cannot hold one opinion about that.
 *
 * Stored as JSON on Institute, the same way notification preferences are, so
 * adding this needed no migration and a school that has never touched it simply
 * gets the defaults below.
 */

/**
 * The scale the platform starts every school on: the Pakistani board scale.
 *
 * It used to be a ten-band scale that bottomed out at D-for-50 and F below it,
 * while the pass mark sat at 33. Those two facts contradicted each other, and
 * the result card printed the contradiction: a child on 40% was told
 * "Grade F" and "Result: Pass" on the same sheet. Whatever a school ends up
 * choosing, the scale it is given on day one has to agree with its own pass
 * mark, so the floor of the scale is now the pass mark — E at 33, F below it.
 *
 * This is a default, not a rule. A school sets its own bands and its own pass
 * mark under Settings, and nothing stored is rewritten when it does.
 */
export const DEFAULT_BANDS = [
  { min: 80, letter: "A+", point: 4.0 },
  { min: 70, letter: "A", point: 3.7 },
  { min: 60, letter: "B", point: 3.3 },
  { min: 50, letter: "C", point: 3.0 },
  { min: 40, letter: "D", point: 2.0 },
  { min: 33, letter: "E", point: 1.0 },
  { min: 0, letter: "F", point: 0.0 },
];

/**
 * 33% is the pass mark across most Pakistani boards. A school that uses 40%
 * says so; nothing is assumed beyond the common case.
 */
export const DEFAULT_PASSING = 33;

/**
 * Reads a school's stored policy, filling in whatever it has not set.
 *
 * Bands are sorted high to low and always given a floor at 0, because
 * `bandFor` walks them in order and a scale with a hole in it would return
 * nothing for a low mark rather than an F.
 */
export const gradingPolicy = (institute) => {
  const stored = institute?.gradingSettings ?? null;

  const bands = Array.isArray(stored?.bands) && stored.bands.length
    ? [...stored.bands]
        .filter((b) => Number.isFinite(Number(b?.min)) && typeof b?.letter === "string")
        .map((b) => ({
          min: Number(b.min),
          letter: String(b.letter),
          point: Number.isFinite(Number(b.point)) ? Number(b.point) : 0,
        }))
        .sort((a, b) => b.min - a.min)
    : DEFAULT_BANDS;

  const floored = bands.some((b) => b.min <= 0)
    ? bands
    : [...bands, { min: 0, letter: "F", point: 0 }];

  const passing = Number.isFinite(Number(stored?.passingPercentage))
    ? Math.max(0, Math.min(100, Number(stored.passingPercentage)))
    : DEFAULT_PASSING;

  return { bands: floored, passingPercentage: passing };
};

/**
 * Everything that turns a score into a judgement, bound to one school.
 *
 * Handed round as an object rather than threaded through fifteen call sites as
 * a bare array: a screen holding `grading` cannot accidentally grade one
 * subject on the school's scale and the next on the platform's.
 */
export const gradingFor = (institute) => {
  const { bands, passingPercentage } = gradingPolicy(institute);

  const bandFor = (score) =>
    score === null || score === undefined
      ? null
      : bands.find((b) => score >= b.min) ?? bands[bands.length - 1];

  const letterGrade = (score) => bandFor(score)?.letter ?? null;
  const gradePoint = (score) => bandFor(score)?.point ?? 0;

  /** Null in, null out: an unmarked subject has not failed, it is unmarked. */
  const passed = (score) =>
    score === null || score === undefined ? null : score >= passingPercentage;

  return { bands, passingPercentage, letterGrade, gradePoint, passed };
};
