import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * `db:verify` prints a per-table count and a fingerprint of the lot, and the
 * whole point of the fingerprint is that a matching one means the restore is
 * complete. That promise is only as good as the list of tables it counts.
 *
 * It was not good. `aIInsight` was a typo — the client key is `aiInsight` — so
 * the lookup returned undefined and the loop's `continue` skipped it without a
 * word. `academicClass` and `processedWebhookEvent` were added to the schema
 * long after the list was written and never joined it. Three tables sat outside
 * the fingerprint, so a restore that lost every one of them would still have
 * reported a match.
 *
 * These read the script as text rather than importing it, because importing
 * runs the inventory.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, "../scripts/db-verify.js");

/** The MODELS array, straight out of the source. */
const declaredModels = () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  const block = src.match(/const MODELS = \[([\s\S]*?)\];/);
  if (!block) throw new Error("could not find the MODELS array in db-verify.js");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

/** Prisma's client property for a model, e.g. AiInsight -> aiInsight. */
const clientKey = (name) => name[0].toLowerCase() + name.slice(1);
const schemaModels = () => Prisma.dmmf.datamodel.models.map((m) => clientKey(m.name));

describe("db:verify counts the whole database", () => {
  it("names every model the schema defines", () => {
    const declared = declaredModels();
    const missing = schemaModels().filter((m) => !declared.includes(m));
    expect(missing, `not counted by db:verify: ${missing.join(", ")}`).toEqual([]);
  });

  it("names nothing the Prisma client cannot resolve", () => {
    // The typo that started this would fail here: prismaRaw.aIInsight is undefined.
    const unresolvable = declaredModels().filter((m) => typeof prismaRaw[m]?.count !== "function");
    expect(unresolvable, `no such model on the client: ${unresolvable.join(", ")}`).toEqual([]);
  });

  it("names each model once, so nothing is counted twice", () => {
    const declared = declaredModels();
    const seen = new Set();
    const duplicates = declared.filter((m) => (seen.has(m) ? true : (seen.add(m), false)));
    expect(duplicates).toEqual([]);
  });

  it("only asks for updatedAt where the column exists", () => {
    // Prisma logs its own error block before rejecting, so a swallowed failure
    // still fills a clean run with red. The script asks the schema first.
    const src = fs.readFileSync(SCRIPT, "utf8");
    expect(src).toContain("HAS_UPDATED_AT");

    const withUpdatedAt = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.name === "updatedAt"))
      .map((m) => clientKey(m.name));

    // A few that must be on either side of that line.
    expect(withUpdatedAt).toContain("institute");
    expect(withUpdatedAt).toContain("student");
    expect(withUpdatedAt).not.toContain("plan");
    expect(withUpdatedAt).not.toContain("auditLog");
  });

  it("still only reads", () => {
    const src = fs.readFileSync(SCRIPT, "utf8");

    // Scoped to Prisma receivers on purpose: a bare /update\(/ also matches
    // `crypto.createHash(...).update(...)`, which is how the fingerprint is
    // built and is not a database write.
    const write = /\b(?:client|prismaRaw(?:\.\w+)?|tx(?:\.\w+)?)\s*\.\s*(createMany|create|updateMany|update|deleteMany|delete|upsert)\s*\(/;
    const hit = src.match(write);
    expect(hit, `db-verify.js must never write: found ${hit?.[0]}`).toBeNull();

    for (const raw of ["$executeRaw", "$queryRawUnsafe"]) {
      expect(src, `db-verify.js must never run ${raw}`).not.toContain(raw);
    }
  });
});
