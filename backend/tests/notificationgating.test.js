import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOTIFICATION_PREFS } from "../src/utils/notifications.js";

/**
 * A preference the school can switch has to switch something.
 *
 * "Email notices to parents" shipped as a toggle in Settings, described as
 * "Emails a copy of each published notice to guardians", and no line of code
 * anywhere read the key. An admin turning it on believed guardians had been
 * told about a holiday or a fee deadline; nothing had been sent. That is worse
 * than not offering the setting, because the school stops checking.
 *
 * This is structural rather than behavioural on purpose: it fails the moment a
 * preference is added without a consumer, which is the point at which the
 * mistake is cheap. What each preference *does* is pinned by the tests for the
 * feature it gates — absencealerts, feeheads, onboarding.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, "..", "src");

/** Every .js file under src/, minus the file the preferences are declared in. */
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".js") ? [full] : [];
  });

const DECLARATION = path.join(SRC, "utils", "notifications.js");
const corpus = sourceFiles(SRC)
  .filter((f) => f !== DECLARATION)
  .map((f) => ({ file: path.relative(SRC, f), text: readFileSync(f, "utf8") }));

describe("every notification preference gates something", () => {
  it("has at least one preference", () => {
    expect(NOTIFICATION_PREFS.length).toBeGreaterThan(0);
  });

  for (const pref of NOTIFICATION_PREFS) {
    it(`"${pref.key}" is read somewhere outside its own declaration`, () => {
      const readers = corpus.filter((f) => f.text.includes(pref.key)).map((f) => f.file);
      expect(
        readers,
        `${pref.key} is offered to schools as "${pref.label}" and described as ` +
          `"${pref.description}", but nothing in src/ reads it. Either wire it up ` +
          `or take the preference out — do not ship a switch that moves nothing.`
      ).not.toHaveLength(0);
    });
  }

  /**
   * The UI prints this line under each toggle, so it has to name something a
   * reader could go and check.
   */
  it("says what each one controls", () => {
    for (const pref of NOTIFICATION_PREFS) {
      expect(pref.controls, `${pref.key} has no "controls" line`).toBeTruthy();
      expect(pref.label).toBeTruthy();
      expect(pref.description).toBeTruthy();
    }
  });

  /**
   * The one that was wrong. Kept as its own case so a future reader sees the
   * specific mistake, not only the general rule.
   */
  it("no longer offers notice emails, which nothing sent", () => {
    expect(NOTIFICATION_PREFS.map((p) => p.key)).not.toContain("noticeEmails");
  });
});
