/**
 * A class is two strings on the student — `grade` and `section`. There is no
 * class id to get wrong, so the spelling *is* the identity: "grade 8" and
 * "Grade 8" are two different classes, and a child filed under the wrong one is
 * missing from the register, missing from the timetable, and left behind at
 * promotion, with nothing anywhere reporting it.
 *
 * These back the CSV import's near-miss check, and only that. The rule was also
 * tried on `POST /api/students` and taken back out: the seeded school already
 * holds one hand-typed "grade 8", and with the rule in place every later
 * attempt to add a "Grade 8" student there was refused. The check cannot tell
 * which of two spellings is the mistake, so on a single child it would punish
 * whoever is cleaning up rather than whoever made the mess. On a bulk import it
 * still earns its place — that path is all-or-nothing, the admin sees the
 * problem before anything is written, and one wrong column misfiles a whole
 * year group. `tests/import.test.js` pins both halves of that decision.
 */

/**
 * Case- and spacing-insensitive key, for spotting the near-miss.
 *
 * The first version of this shipped as `/s+/g` — a lost backslash, so it
 * replaced the letter "s" rather than whitespace, and "Class A" became
 * "cla  a". Nothing caught it, because a difference of case alone is mangled
 * identically on both sides and still matches. Whitespace is the case that
 * tells the two apart, and it is now covered by a test.
 */
export const loose = (v) => v.trim().toLowerCase().replace(/\s+/g, " ");

/** The spellings in use, indexed both exactly and loosely. */
export const spellings = (values) => {
  const used = new Set();
  const byLooseKey = new Map();
  for (const v of values) {
    if (!v) continue;
    used.add(v);
    if (!byLooseKey.has(loose(v))) byLooseKey.set(loose(v), v);
  }
  return { used, byLooseKey };
};

/**
 * The complaint about one field, or null when there is nothing to say.
 *
 * Deliberately narrow. Only a spelling the school already writes another way is
 * refused:
 *
 *     "grade 8"   while "Grade 8" exists   → refused, naming the existing one
 *     "Grade 11"  never seen before        → allowed; adding a class is normal
 *     "Grade 8"   already in use           → allowed, even if "grade 8" also
 *                                            exists somewhere already
 *
 * That last case matters: a school that has ended up with both must not find
 * itself unable to add to either.
 */
export const spellingProblem = (label, value, known) => {
  if (!value || known.used.has(value)) return null;
  const already = known.byLooseKey.get(loose(value));
  if (!already) return null;
  return (
    `${label} "${value}" is written "${already}" everywhere else in this ` +
    `school — a class is matched on the exact text, so this would make a ` +
    `second one`
  );
};
