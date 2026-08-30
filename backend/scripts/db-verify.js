/**
 * Read-only inventory of the database.
 *
 * Prints a per-table row count and the newest `updatedAt` it can find, plus a
 * short fingerprint of the whole thing. Run it before taking a backup and
 * again after restoring one: if the fingerprints match, the restore is
 * complete. That is the check that turns "we have backups" into "we have
 * backups that work", and it is the step people skip.
 *
 *   npm run db:verify
 *
 * It only ever SELECTs. There is no code path here that writes, so it is safe
 * against production — including against a freshly restored copy you are still
 * deciding whether to trust.
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Models worth counting, in a stable order so fingerprints are comparable.
 *
 * Changing this list changes every fingerprint it produces, which is fine —
 * the comparison this tool exists for is "before a backup" against "after the
 * restore of that backup", both taken with the same build. Old fingerprints
 * written down elsewhere will not match, and should not be expected to.
 */
const MODELS = [
  "institute", "user", "student", "teacher", "parent",
  "subject", "enrollment", "assessment", "attendance",
  "academicClass", "timetableSlot", "studentPromotion", "academicSession", "examTerm",
  "feeInvoice", "feeItem", "subscriptionInvoice", "notice", "message",
  "aiInsight", "auditLog",
  "refreshToken", "passwordResetToken", "plan", "platformSetting",
  "processedWebhookEvent",
];

/**
 * Which models carry an `updatedAt`, asked of the schema rather than guessed.
 *
 * The loop below used to try `orderBy: { updatedAt: "desc" }` on everything and
 * catch the failure. The catch worked, but Prisma logs its own `prisma:error`
 * block before rejecting, so a clean run printed a wall of red for tables that
 * simply never had the column — Plan, Message, AuditLog and four others. Asking
 * first is quieter and one query cheaper.
 */
const HAS_UPDATED_AT = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "updatedAt"))
    .map((m) => m.name[0].toLowerCase() + m.name.slice(1))
);

/**
 * Every model the schema defines, so a new one cannot quietly stay out of the
 * count.
 *
 * This is not hypothetical: `aIInsight` was a typo for `aiInsight`, so the
 * client lookup returned undefined and the loop skipped it — and
 * `academicClass` and `processedWebhookEvent` were added to the schema long
 * after this list was written. Three tables were outside the fingerprint,
 * which means a restore that lost all of them would still have "matched".
 */
const SCHEMA_MODELS = Prisma.dmmf.datamodel.models.map(
  (m) => m.name[0].toLowerCase() + m.name.slice(1)
);

const pad = (s, n) => String(s).padEnd(n);

async function main() {
  const rows = [];
  let total = 0;

  const unreadable = [];

  for (const model of MODELS) {
    const client = prismaRaw[model];
    if (!client?.count) {
      // Loudly, not silently — a name that does not resolve is a hole in the
      // fingerprint, and the old `continue` here is exactly how one hid.
      unreadable.push(model);
      continue;
    }

    const count = await client.count();
    total += count;

    let newest = null;
    if (HAS_UPDATED_AT.has(model)) {
      const latest = await client.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      });
      newest = latest?.updatedAt ?? null;
    }

    rows.push({ model, count, newest });
  }

  const uncounted = SCHEMA_MODELS.filter((m) => !MODELS.includes(m));

  console.log(`\n  Database inventory — ${new Date().toISOString()}\n`);
  console.log(`  ${pad("TABLE", 22)}${pad("ROWS", 9)}NEWEST UPDATE`);
  console.log(`  ${"─".repeat(60)}`);
  for (const r of rows) {
    console.log(
      `  ${pad(r.model, 22)}${pad(r.count, 9)}${r.newest ? r.newest.toISOString() : "—"}`
    );
  }

  // Counts only — deliberately not row contents, so this is cheap on a large
  // database and safe to paste into a ticket.
  const fingerprint = crypto
    .createHash("sha256")
    .update(rows.map((r) => `${r.model}:${r.count}`).join("|"))
    .digest("hex")
    .slice(0, 16);

  console.log(`  ${"─".repeat(60)}`);
  console.log(`  ${pad("TOTAL", 22)}${total}`);
  console.log(`\n  Fingerprint: ${fingerprint}`);
  console.log("  Compare this before a backup and after a restore.");

  if (unreadable.length) {
    console.log(
      `\n  ⚠ Named but not found on the client: ${unreadable.join(", ")}` +
        `\n    These are NOT in the fingerprint. Check the spelling against the schema.`
    );
  }
  if (uncounted.length) {
    console.log(
      `\n  ⚠ In the schema but not counted: ${uncounted.join(", ")}` +
        `\n    Add them to MODELS, or a restore that loses them will still match.`
    );
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("\n  ✖ Could not read the database:", err.message, "\n");
    process.exitCode = 1;
  })
  .finally(() => prismaRaw.$disconnect());
