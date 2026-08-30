/**
 * Rehearses the restore, so "we have backups" becomes "we have backups that work".
 *
 *   npm run db:restore-check                 → dumps, restores, compares, cleans up
 *   npm run db:restore-check -- <file.dump>  → rehearses an existing dump instead
 *
 * A backup nobody has restored is a guess. This runs the drill from
 * DEPLOYMENT.md § Restoring end to end and answers the only question that
 * matters: does the dump come back as the same database?
 *
 *   1. Fingerprint the live database        (db-verify.js — read-only)
 *   2. Take a dump                          (pg_dump — read-only)
 *   3. Create a scratch database            (a fresh, uniquely named one)
 *   4. Restore into it                      (pg_restore)
 *   5. Fingerprint the scratch database     (the same db-verify.js)
 *   6. Compare, then drop the scratch
 *
 * **It never writes to the live database.** Everything it creates is a scratch
 * copy with a generated name, and step 6 removes it whether the rehearsal
 * passed or failed. If the name it generated somehow matched the live database
 * it refuses to run at all.
 *
 * `db-verify.js` is run as a child process rather than imported, because that
 * is the tool a person reaches for during an incident — rehearsing with it is
 * worth more than rehearsing with a private copy of its logic.
 *
 * ⚠ Take this while nothing is writing. The fingerprint is taken just before
 * the dump; a write in between would make an honest restore look wrong.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { databaseOf, findPgTool, libpqUrl } from "./lib/pg-tools.js";

dotenv.config();

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..");

const line = (s = "") => console.log(s);
const ok = (s) => console.log(`  ✓ ${s}`);
const bad = (s) => console.log(`  ✗ ${s}`);

const url = process.env.DATABASE_URL;
if (!url) {
  bad("DATABASE_URL is not set — nothing to rehearse against.");
  process.exit(1);
}

const liveDb = databaseOf(url);
const scratchDb = `educonnect_restore_check_${Date.now()}`;

/** Nothing here may touch the real database. */
if (!liveDb || scratchDb === liveDb) {
  bad(`refusing to run: the scratch name matched the live database (${liveDb}).`);
  process.exit(1);
}

const tools = {};
for (const name of ["pg_dump", "pg_restore", "createdb", "dropdb"]) {
  const found = findPgTool(name);
  if (!found) {
    bad(`${name} could not be found — install the PostgreSQL client tools.`);
    process.exit(1);
  }
  tools[name] = found;
}

/** Runs db-verify.js against one database and returns its fingerprint. */
const fingerprint = async (target) => {
  const { stdout } = await run(process.execPath, ["scripts/db-verify.js"], {
    cwd: BACKEND,
    // dotenv leaves an already-present variable alone, so this wins over .env.
    env: { ...process.env, DATABASE_URL: target },
    maxBuffer: 8 * 1024 * 1024,
  });
  const match = stdout.match(/Fingerprint:\s*([0-9a-f]+)/i);
  const total = stdout.match(/TOTAL\s+(\d+)/);
  if (!match) throw new Error("db-verify.js printed no fingerprint");
  return { hash: match[1], rows: total ? Number(total[1]) : null };
};

const pg = (tool, args, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(tools[tool], args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", () => {});
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${tool} exited ${code}: ${err.trim().slice(0, 400)}`))
    );
  });

/** The dump to rehearse: the one given, else the newest, else a fresh one. */
const chooseDump = async () => {
  const given = process.argv[2];
  if (given) {
    if (!existsSync(given)) throw new Error(`no such dump: ${given}`);
    return { file: given, fresh: false };
  }
  const dir = path.join(BACKEND, "backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `restore-check-${Date.now()}.dump`);
  await pg("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    file,
    libpqUrl(url),
  ]);
  ownDump = file;
  return { file, fresh: true };
};

let created = false;
/** A dump this run made itself, to be removed again — a rehearsal is not a backup. */
let ownDump = null;

const cleanup = async () => {
  if (ownDump) {
    rmSync(ownDump, { force: true });
    ok("rehearsal dump removed — take real ones with npm run db:backup");
  }
  if (!created) return;
  try {
    await pg("dropdb", ["--if-exists", scratchDb, "--host", new URL(url).hostname,
      "--port", new URL(url).port || "5432", "--username", decodeURIComponent(new URL(url).username)],
      { PGPASSWORD: decodeURIComponent(new URL(url).password) });
    ok(`scratch database dropped (${scratchDb})`);
  } catch (e) {
    bad(`could not drop the scratch database ${scratchDb} — remove it by hand: ${e.message}`);
  }
};

const main = async () => {
  line();
  line("EduConnect — restore rehearsal");
  line("=".repeat(52));
  line();
  line(`  live     ${liveDb}`);
  line(`  scratch  ${scratchDb}`);
  line();

  line("1. Fingerprinting the live database");
  const before = await fingerprint(url);
  ok(`${before.hash}  (${before.rows} rows)`);

  line();
  line("2. Dump");
  const { file, fresh } = await chooseDump();
  const mb = (statSync(file).size / 1024 / 1024).toFixed(2);
  ok(`${fresh ? "took" : "using"} ${path.basename(file)} — ${mb} MB`);

  line();
  line("3. Scratch database");
  const u = new URL(url);
  const pgEnv = { PGPASSWORD: decodeURIComponent(u.password) };
  const connArgs = [
    "--host", u.hostname,
    "--port", u.port || "5432",
    "--username", decodeURIComponent(u.username),
  ];
  await pg("createdb", [...connArgs, scratchDb], pgEnv);
  created = true;
  ok(`created ${scratchDb}`);

  line();
  line("4. Restore");
  await pg("pg_restore", [
    "--no-owner",
    "--no-privileges",
    "--dbname",
    libpqUrl(url, { database: scratchDb }),
    file,
  ]);
  ok("pg_restore finished without error");

  line();
  line("5. Fingerprinting the restored copy");
  const after = await fingerprint(libpqUrl(url, { database: scratchDb }));
  ok(`${after.hash}  (${after.rows} rows)`);

  line();
  line("=".repeat(52));
  line();
  if (before.hash === after.hash) {
    ok("FINGERPRINTS MATCH — this dump restores to the same database.");
    line();
    line("    That is the whole point: the backup is not a guess any more.");
  } else {
    bad("FINGERPRINTS DIFFER — do not rely on this backup.");
    line();
    line(`    live     ${before.hash}  (${before.rows} rows)`);
    line(`    restored ${after.hash}  (${after.rows} rows)`);
    line();
    line("    A difference of a few rows in auditLog or refreshToken usually means");
    line("    something was writing during the rehearsal — stop the API and retry.");
    line("    Anything larger is a real gap between the dump and the database.");
  }
  line();
  return before.hash === after.hash;
};

let passed = false;
try {
  passed = await main();
} catch (err) {
  line();
  bad(err.message);
  line();
} finally {
  await cleanup();
  line();
}
process.exit(passed ? 0 : 1);
