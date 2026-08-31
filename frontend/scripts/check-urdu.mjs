/**
 * Checks that the parent portal is actually in Urdu.
 *
 * The frontend has no test runner, so this is a plain script rather than a
 * suite: `npm run check:urdu`. It reads the parent portal's own region of
 * App.jsx and looks for user-visible English that never passes through `t`.
 *
 * This exists because reading the screen is the only way these were found.
 * Every leak below was live: the week strip printed "present" under an Urdu
 * weekday, the largest card on the AI tab showed "No marks recorded yet"
 * beside its own translated caption, and a guardian was told their child's
 * message arrived "12d ago". None of them looked wrong in the source — three
 * were one missing `t()` on a line whose neighbours all had one, and the
 * fourth was a string formatted in the adapter before the portal ever saw it.
 *
 * The check is deliberately dumb: string literals in JSX text position and in
 * the props that render as text. It cannot see a string the API returns, so it
 * is a floor, not a ceiling — `npm run check:urdu` passing does not mean the
 * portal is fully translated, only that it has not regressed in the ways that
 * have already bitten.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "App.jsx"), "utf8");
const i18n = readFileSync(join(here, "..", "src", "i18n.js"), "utf8");

let pass = 0,
  fail = 0;
const ok = (label, good, detail) => {
  good ? pass++ : fail++;
  console.log(`  ${good ? "✓" : "✗"} ${label}`);
  if (!good && detail) console.log(detail);
};

/**
 * The parent portal's slice of the file.
 *
 * `useLang()` is called once, by the parent portal and nowhere else, which
 * makes it the marker for where its region begins. It runs to the end of the
 * component, and the next top-level `const` at zero indentation is the next
 * component along.
 */
const start = src.indexOf("  useLang();");
if (start === -1) {
  console.log("  ✗ could not find the parent portal (useLang() is gone?)");
  process.exit(1);
}
const after = src.slice(start);
const endRel = after.search(/\nconst [A-Z]\w+\s*=/);
const region = endRel === -1 ? after : after.slice(0, endRel);

console.log("\n=== the parent portal's region ===");
ok("found it", region.length > 5000, `      only ${region.length} chars — the marker may have moved`);

/**
 * Places a literal is text the guardian reads, rather than a style or a key.
 *
 * Each pattern wants two or more words of letters, which skips identifiers,
 * class names, colours and CSS values without needing to know what they are.
 */
const RENDERED = [
  { name: "JSX text", re: />\s*([A-Z][a-z]+(?: [a-z]+){2,})\s*</g },
  { name: "label prop", re: /\blabel=\{?["']([A-Z][a-z]+(?: [a-z]+){1,})["']/g },
  { name: "sub prop", re: /\bsub=\{?["']([A-Z][a-z]+(?: [a-z]+){1,})["']/g },
  { name: "title prop", re: /\btitle=\{?["']([A-Z][a-z]+(?: [a-z]+){1,})["']/g },
  { name: "placeholder", re: /\bplaceholder=\{?["']([A-Z][a-z]+(?: [a-z]+){1,})["']/g },
];

console.log("\n=== English left in the parent portal ===");
const leaks = [];
for (const { name, re } of RENDERED) {
  for (const m of region.matchAll(re)) {
    const phrase = m[1].trim();
    // A literal sitting inside t("…") / tn("…") / tc(…) is already handled.
    const before = region.slice(Math.max(0, m.index - 6), m.index + 2);
    if (/\bt[nc]?\(\s*["'`]?$/.test(before)) continue;
    leaks.push(`${name}: ${JSON.stringify(phrase)}`);
  }
}
ok(
  "no untranslated prose in text position",
  leaks.length === 0,
  leaks.map((l) => `      ${l}`).join("\n")
);

console.log("\n=== the leaks that actually shipped ===");

/**
 * Each of these is a line that was wrong in the running product, named by the
 * thing it must not go back to being.
 */
const mustPass = [
  ["the week strip translates its status", /\{t\(w\.s\)\}/],
  ["the AI card translates its standing", /t\(student\.aiScoreLabel\)/],
  ["message times are re-formatted, not reused raw", /timeAgo\((?:m|selMsg)\.at,\s*t\)/],
  ["the class rank is built from a key", /tn\("#\{n\} of \{v\}"/],
  ["the projection names its own units", /tc\(subs\.length,\s*"subject"\)/],
];
for (const [label, re] of mustPass) ok(label, re.test(region));

console.log("\n=== the keys those need ===");
const needed = [
  "present",
  "absent",
  "late",
  "leave",
  "Excellent",
  "On track",
  "Needs support",
  "At risk",
  "No marks recorded yet",
  "{n} day",
  "{n} days",
  "{n} subject",
  "{n} subjects",
  "{n}d ago",
  "{n}h ago",
  "{n}m ago",
  "just now",
  "#{n} of {v}",
  "Based on {v} and {d} of attendance.",
  "{n} is projected to average {v} across their subjects",
];
const missing = needed.filter((k) => {
  const quoted = /[^A-Za-z]/.test(k) ? `"${k}"` : `${k}:`;
  return !i18n.includes(quoted);
});
ok("every key is in i18n.js", missing.length === 0, `      missing: ${missing.join(", ")}`);

console.log("\n=== Urdu stays out of every other portal ===");

/**
 * The language is a module-level choice that outlives a session, so an admin
 * signing in on a device where a parent once picked Urdu must still get
 * English. That holds only while `t` is called from the parent portal alone.
 */
const outside = src.slice(0, start);
const lines = src.split("\n");
const lineOf = (i) => src.slice(0, i).split("\n").length - 1;

/**
 * A `t()` before the portal begins is not automatically wrong: a component can
 * be declared anywhere in the file and still be rendered by the portal alone.
 * `ChildSwitcher` is exactly that. What matters is who renders it, so each
 * translating component is traced back to its declaration and forward to every
 * place it is used — and every one of those has to be inside the region.
 */
const strays = [];
for (const m of outside.matchAll(/[^A-Za-z.]t[nc]?\(\s*["'`]/g)) {
  let owner = null;
  for (let i = lineOf(m.index); i >= 0; i--) {
    const d = lines[i].match(/^const ([A-Z]\w+)\s*=/);
    if (d) {
      owner = d[1];
      break;
    }
  }
  if (!owner) {
    strays.push(`a t() at line ${lineOf(m.index) + 1} sits in no component`);
    continue;
  }
  const used = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].includes("<" + owner)) used.push(i);
  const portalStart = lineOf(start);
  const outsideUse = used.filter((i) => i < portalStart);
  if (!used.length) strays.push(`${owner} translates but is never rendered`);
  else if (outsideUse.length)
    strays.push(`${owner} translates and is rendered at line ${outsideUse[0] + 1}, outside the portal`);
}
ok(
  "only the parent portal renders anything that translates",
  strays.length === 0,
  strays.map((l) => `      ${l}`).join("\n")
);
ok("useLang() has exactly one caller", src.split("useLang();").length - 1 === 1);

console.log(`\n${"=".repeat(50)}\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
