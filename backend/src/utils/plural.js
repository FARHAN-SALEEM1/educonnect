/**
 * "3 students", "1 student".
 *
 * Every message here reaches a person: they are the text of the banner an
 * admin sees after saving a register, generating a month of challans, or
 * importing a roster. "Attendance saved for 1 student(s)" is the sound of a
 * form nobody finished, and it was the sentence a school read at the end of
 * the most routine thing it does all day.
 *
 * The frontend has had `count` for this. This is the same function, so the
 * two halves of a sentence that crosses the wire agree with each other.
 */
export const count = (n, singular, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;

/** "was" / "were", for a sentence built around `count`. */
export const wasWere = (n) => (n === 1 ? "was" : "were");

/** "has" / "have". */
export const hasHave = (n) => (n === 1 ? "has" : "have");
