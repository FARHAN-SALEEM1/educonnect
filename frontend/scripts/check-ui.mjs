/**
 * Guards on the shared primitives every screen is built from.
 *
 * The frontend has no test runner and these components live inside a 9,000
 * line file of JSX, so this reads the source rather than rendering it:
 * `npm run check:ui`. That makes it a guard, not a test — it can only say the
 * shape of the code has not gone back to what it was, which for a one-token
 * mistake that broke every filter in the product is worth having.
 *
 * Everything here is a bug that shipped and was found by using the app.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "App.jsx"), "utf8");

let pass = 0,
  fail = 0;
const ok = (label, good, detail) => {
  good ? pass++ : fail++;
  console.log(`  ${good ? "✓" : "✗"} ${label}`);
  if (!good && detail) console.log(`      ${detail}`);
};

const between = (from, to) => {
  const a = src.indexOf(from);
  if (a === -1) return "";
  const b = src.indexOf(to, a + from.length);
  return src.slice(a, b === -1 ? undefined : b);
};

console.log("\n=== Sel — the option a filter clears itself with ===");

const sel = between("const Sel=(", "const Btn=(");
ok("found the component", sel.length > 100, "Sel has moved or been renamed");

/**
 * Every filter offers `{v:"",l:"All grades"}` as its first option. An empty
 * string is falsy, so `o.v||o` handed <option> the object itself and it
 * rendered value="[object Object]" — picking "All grades" set the filter to
 * that string instead of clearing it, and the roster then filtered by a grade
 * nobody is in. An admin narrowing to Grade 5 saw 200 of 2,000, went back to
 * All grades, and was told the school had none, under a select still reading
 * "All grades" because the value it held matched no option.
 */
ok(
  "an option's value falls back with ?? , not ||",
  /value=\{o\.v\?\?o\}/.test(sel),
  "value={o.v||o} turns the empty option into [object Object]"
);
ok("its key does too", /key=\{`\$\{o\.v\?\?o\}`\}/.test(sel));
ok("so does its label", /\{o\.l\?\?o\}/.test(sel));
ok(
  "no || fallback is left on an option",
  !/(key|value)=\{o\.[vl]\|\|o\}/.test(sel),
  "one of key/value still uses ||"
);

console.log("\n=== a filter cannot outlive what it filters by ===");

/**
 * Closing a campus while its roster was on screen left the id in state.
 * Nothing matches a deleted branch, so the list reported zero students out of
 * two thousand while the dropdown — unable to find that id among its options —
 * read "All campuses" above the empty table.
 */
ok(
  "a closed campus clears the roster filter",
  /if\(stuBranch&&!branches\.some\(b=>b\.id===stuBranch\)\)setStuBranch\(""\)/.test(src)
);
ok(
  "and the staff filter",
  /if\(tchBranch&&!branches\.some\(b=>b\.id===tchBranch\)\)setTchBranch\(""\)/.test(src)
);

/**
 * `branches` is a const in the same component body, so an effect reading it
 * has to sit below the declaration or the component throws on its first render
 * — which a bundler will happily build and only the browser will tell you.
 */
const decl = src.indexOf("const branches=db.branches");
const guard = src.indexOf("if(stuBranch&&!branches.some");
ok(
  "that effect sits below the const it reads",
  decl !== -1 && guard > decl,
  "temporal dead zone: the component would throw on first render"
);

console.log("\n=== long lists draw a window, not the whole table ===");

/**
 * The portal holds every row in memory so search stays instant across the
 * whole roll, but it was rendering all of them too: 2,000 rows, 34,000 DOM
 * nodes and 443ms of layout per keystroke on a desktop.
 */
for (const [label, re] of [
  ["the roster", /shownStudents\.slice\(0,stuShow\)/],
  ["the fee table", /invoices\.slice\(0,feeShow\)/],
  ["the staff cards", /shownTeachers\.slice\(0,tchShow\)/],
  ["the guardian list", /shownParents\.slice\(0,parShow\)/],
])
  ok(`${label} is windowed`, re.test(src));

/** A new search has to start at the top, not 500 rows into the last one. */
ok(
  "the roster's window resets when the filters change",
  /useEffect\(\(\)=>\{setStuShow\(STU_PAGE\);\},\[stuQ,stuGrade,stuStatus,stuBranch\]\)/.test(src)
);

/** Exports are the whole set — windowing the screen must not shrink the file. */
ok(
  "the fee export still reads every invoice",
  /downloadCsv\(stamped\("fee-collection-report","csv"\),list\.map/.test(src),
  "the export is reading the drawn window rather than the data"
);

console.log("\n=== a zero nobody scored ===");

/**
 * The API averages the enrolments that carry a score and returns 0 when none
 * of them do, because the ranking sorts on that number. Printed as it stands,
 * a child admitted this morning appeared in the roster at 0% average and 0%
 * attendance — not a blank, but the school saying they sat every paper and got
 * nothing right, and were absent every day since. This codebase has fixed the
 * same confusion three times already: rank #0, a subject's score, and an AI
 * standing of "Excellent" for a child with nothing marked.
 *
 * These match on source text rather than regex-of-regex, which keeps them
 * readable next to the lines they are guarding.
 */
for (const [label, needle] of [
  ["the roster's average", '{s.scored?`${s.average}%`:"—"}'],
  ["the roster's attendance", '{s.att.days?`${s.att.present}%`:"—"}'],
  ["the detail panel", 'selStu.scored?`${selStu.average}%`:"—"'],
  ["the parent portal's headline", 'student.scored?`${student.average}%`:"—"'],
])
  ok(`${label} says "—" rather than 0%`, src.includes(needle));

ok(
  "no bare average is printed in the roster",
  !src.includes("}>{s.average}%</td>"),
  "a raw {s.average}% is back in the table"
);

ok(
  "the attendance summary is windowed too",
  src.includes("summaryRows.slice(0,attShow)")
);

/**
 * And it leaves out the children it has nothing to say about. A pupil admitted
 * this week has no attendance to summarise, and an empty record read as 0% put
 * every new arrival at the top of a list whose whole job is to surface the ones
 * who are not turning up.
 */
ok(
  "and lists only children with attendance behind them",
  src.includes("students.filter(s=>s.att.days>0).sort((a,b)=>a.att.present-b.att.present)")
);

console.log("\n=== plurals a person would not write ===");

/**
 * "4 row(s) were skipped" is the sound of a form that was never finished, and
 * it was on the screen a school sees while importing its whole roll. There is
 * a `count` helper for this — it was already used in places, which is what
 * made the twenty-six that were not stand out.
 *
 * The exclusions are function calls: `map(s)`, `(s)=>`, and the like.
 */
const plurals = [...src.matchAll(/[A-Za-z]+\(s\)/g)]
  .map((m) => m[0])
  .filter((x) => !/^(map|filter|find|some|every|forEach|sort)\(s\)$/.test(x))
  .filter((x) => !/(ing|ove|ats|sc|f)\(s\)$/.test(x));
ok(
  "no (s) plurals are left in what a person reads",
  plurals.length === 0,
  `still there: ${[...new Set(plurals)].join(", ")}`
);
ok(
  "the count helper exists to make that possible",
  /const count = \(n, singular, plural = `\$\{singular\}s`\) =>/.test(src)
);

console.log("\n=== a new screen starts at the top of itself ===");

/**
 * Swapping the view does not move the scroll. The landing page is 3,900px on
 * a desktop and 4,900 on a phone; the registration wizard is 900. Someone who
 * read down to the pricing and pressed "Get Started — Free Trial" got the
 * form with their old offset clamped onto it, so the logo, the words
 * "Institute Registration" and the 1-2-3-4 step dots were all above the fold.
 * Nothing said the click had done anything — which is how it was reported:
 * the button does not work.
 */
ok(
  "changing screen scrolls to the top",
  src.includes("useEffect(()=>{window.scrollTo(0,0);},[screen]);"),
  "the signup wizard opens at whatever offset the landing page was left at"
);
ok(
  "and so does changing tab inside a portal",
  src.includes("useEffect(()=>{window.scrollTo(0,0);},[tab]);")
);

console.log("\n=== a date is the day it says ===");

/**
 * Dates are stored at midnight UTC. Read back with a local accessor on a
 * machine behind UTC they name the day before: a challan due on the 10th
 * showed "9", and a Thursday register showed a guardian "Wed". `paidAt` is a
 * real moment rather than a day, so it keeps its local formatting.
 */
ok(
  "the fee table reads a due date in UTC",
  src.includes("new Date(f.dueDate).getUTCDate()"),
  "getDate() on a stored date names the previous day west of UTC"
);

console.log("\n=== controls a finger has to reach ===");

/**
 * Present / Absent / Late / Leave plus a name want ~450px of a 375px row, so
 * Leave hung off the right edge of the register — the screen a teacher opens
 * more than any other. The class and date pickers above it did the same, and
 * took the date field's calendar button off-screen with them.
 */
ok("the register row wraps on a phone", /\.ec-attrow\{flex-wrap:wrap!important;\}/.test(src));
ok("its four marks share the width", /\.ec-attmarks>\*\{flex:1!important/.test(src));
ok("the class and date pickers stack", /\.ec-pickers>\*\{flex:1 1 100%!important/.test(src));
ok(
  "both registers use those pickers",
  (src.match(/className="ec-pickers"/g) || []).length === 2,
  "the admin and teacher registers should both carry it"
);

/**
 * A grid child sizes itself with min-width:auto, so a card holding a wide
 * table would not shrink and `max-width:100%` on the table resolved against
 * the card's 815px rather than the phone's 375px. The damage lands on
 * whatever sits beside the table, not on the table.
 */
ok(
  "grid children may shrink on a phone",
  /\[style\*="display:grid"\]>\*,\[style\*="display: grid"\]>\*\{min-width:0!important;\}/.test(src)
);

console.log(`\n${"=".repeat(50)}\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
