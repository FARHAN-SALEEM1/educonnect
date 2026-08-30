/**
 * Finds the PostgreSQL command-line tools.
 *
 * `pg_dump`, `pg_restore` and friends ship with the server but the Windows
 * installer does not add them to PATH, so `npm run db:backup` fails on a
 * machine that has a perfectly working database. Telling people to edit PATH
 * makes a backup depend on a manual step nobody repeats on the next machine —
 * and a backup that only some machines can take is not a backup procedure.
 *
 * So: use PATH when it works, and otherwise look where the installer puts
 * them. Newest major version first, because that is the one most likely to be
 * able to read the server's dump format.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const WINDOWS_ROOTS = ["C:\\Program Files\\PostgreSQL", "C:\\Program Files (x86)\\PostgreSQL"];
const UNIX_DIRS = ["/usr/lib/postgresql", "/usr/local/pgsql/bin", "/opt/homebrew/bin", "/usr/local/bin"];
const MAJORS = [18, 17, 16, 15, 14, 13];

const exe = (name) => (process.platform === "win32" ? `${name}.exe` : name);

/** Is it already runnable as a bare name? */
const onPath = (name) => {
  try {
    execFileSync(name, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/**
 * The absolute path to one tool, or null.
 *
 * Never throws: the caller decides what a missing tool means. `db:backup`
 * treats it as fatal; a check that is only rehearsing can report it and stop
 * without pretending something failed.
 */
export const findPgTool = (name) => {
  if (onPath(name)) return name;

  const candidates = [];
  if (process.platform === "win32") {
    for (const root of WINDOWS_ROOTS) {
      for (const v of MAJORS) candidates.push(path.join(root, String(v), "bin", exe(name)));
    }
  } else {
    for (const v of MAJORS) candidates.push(path.join("/usr/lib/postgresql", String(v), "bin", name));
    for (const dir of UNIX_DIRS) candidates.push(path.join(dir, name));
  }

  return candidates.find((p) => existsSync(p)) ?? null;
};

/** Where a found tool came from, for a message that helps rather than blames. */
export const describePgTools = (names) =>
  names
    .map((n) => {
      const found = findPgTool(n);
      if (!found) return `  ✖ ${n} — not found`;
      return `  ✓ ${n} — ${found === n ? "on PATH" : found}`;
    })
    .join("\n");

/**
 * A connection URL the PostgreSQL tools will accept.
 *
 * Prisma's string carries options libpq has never heard of — `schema`,
 * `connection_limit`, `pgbouncer` — and the tools reject the whole URI rather
 * than ignoring them: *invalid URI query parameter: "schema"*. So they are
 * stripped. Pass `database` to point the same credentials at a different one,
 * which is how a restore rehearsal reaches its scratch copy without anything
 * being retyped.
 */
const PRISMA_ONLY = new Set([
  "schema",
  "connection_limit",
  "pool_timeout",
  "pgbouncer",
  "socket_timeout",
  "statement_cache_size",
]);

export const libpqUrl = (url, { database } = {}) => {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    if (PRISMA_ONLY.has(key)) parsed.searchParams.delete(key);
  }
  if (database) parsed.pathname = `/${database}`;
  return parsed.toString();
};

/** The database a connection string points at, for messages and safety checks. */
export const databaseOf = (url) => {
  try {
    return new URL(url).pathname.replace(/^\//, "") || null;
  } catch {
    return null;
  }
};
