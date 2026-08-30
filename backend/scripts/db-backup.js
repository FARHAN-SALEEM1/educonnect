/**
 * Takes a compressed logical backup with `pg_dump`.
 *
 *   npm run db:backup            → ./backups/educonnect-<timestamp>.dump
 *   npm run db:backup -- /path   → writes there instead
 *
 * `pg_dump` only reads, so this is safe to run against production — and it is
 * the thing to run before any migration or risky change.
 *
 * This is a *supplement* to the host's own backups, not a replacement: a dump
 * on the same laptop as the database protects against a bad migration, not a
 * lost account or a deleted project. See DEPLOYMENT.md § Backups for the
 * point-in-time recovery that has to be switched on at the provider.
 */
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { findPgTool } from "./lib/pg-tools.js";

dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\n  ✖ DATABASE_URL is not set — nothing to back up.\n");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const target =
  process.argv[2] ?? path.join(process.cwd(), "backups", `educonnect-${stamp}.dump`);

mkdirSync(path.dirname(target), { recursive: true });

/** The database being dumped, with the password removed before printing. */
const describe = () => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
};

/**
 * Prisma's connection string carries options libpq has never heard of, and
 * pg_dump rejects the whole URI rather than ignoring them — `invalid URI query
 * parameter: "schema"`. So they are stripped, and `schema` is translated into
 * the flag pg_dump actually wants.
 */
const PRISMA_ONLY = new Set([
  "schema", "connection_limit", "pool_timeout", "pgbouncer",
  "socket_timeout", "statement_cache_size",
]);

const dumpTarget = () => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL we can clean — hand it over untouched and let pg_dump judge.
    return { connection: url, extraArgs: [] };
  }

  const extraArgs = [];
  const schema = parsed.searchParams.get("schema");
  if (schema) extraArgs.push(`--schema=${schema}`);

  for (const key of [...parsed.searchParams.keys()]) {
    if (PRISMA_ONLY.has(key)) parsed.searchParams.delete(key);
  }

  return { connection: parsed.toString(), extraArgs };
};

console.log(`\n  Backing up ${describe()}`);
console.log(`  → ${target}\n`);

/**
 * `--format=custom` because it restores with pg_restore, which can do a
 * selective or parallel restore; a plain SQL file cannot.
 */
const { connection, extraArgs } = dumpTarget();

/**
 * Located rather than assumed. The Windows installer does not put these on
 * PATH, so a machine with a healthy database could not take a backup — and a
 * backup procedure that depends on someone remembering to edit PATH is one
 * that works right up until the day it matters.
 */
const pgDump = findPgTool("pg_dump");

const child = spawn(
  pgDump ?? "pg_dump",
  ["--format=custom", "--no-owner", "--no-privileges", ...extraArgs, "--file", target, connection],
  { stdio: ["ignore", "inherit", "inherit"] }
);

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error(
      "  ✖ `pg_dump` could not be found.\n\n" +
        "    It ships with PostgreSQL. This looked on PATH and in the usual\n" +
        "    install locations and found neither, so PostgreSQL is either not\n" +
        "    installed here or somewhere unusual.\n\n" +
        "    Managed hosts can also take backups for you; DEPLOYMENT.md\n" +
        "    § Backups covers what to switch on.\n"
    );
  } else {
    console.error("  ✖ pg_dump failed to start:", err.message);
  }
  process.exit(1);
});

child.on("exit", (code) => {
  if (code !== 0) {
    console.error(`\n  ✖ pg_dump exited with code ${code} — no usable backup was written.\n`);
    process.exit(code ?? 1);
  }
  const size = existsSync(target) ? statSync(target).size : 0;
  if (size === 0) {
    console.error("\n  ✖ The dump file is empty — treat this as a failed backup.\n");
    process.exit(1);
  }
  console.log(`\n  ✓ Wrote ${(size / 1024 / 1024).toFixed(2)} MB.`);
  console.log("    Verify it restores into a scratch database before you rely on it —");
  console.log("    DEPLOYMENT.md § Restoring has the drill.\n");
});
