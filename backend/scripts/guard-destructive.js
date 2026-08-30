/**
 * Refuses to let a destructive database command run against production.
 *
 * `db:reset`, `db:migrate` and `db:push` can drop tables, and `db:seed`
 * recreates the demo accounts — `sa@educonnect.io` / `super123` and friends —
 * whose passwords are printed in this repository and on the login screen.
 * Any of them pointed at a live school's database is a very bad afternoon:
 * either their records are gone, or anyone who has read the README owns the
 * platform.
 *
 * Two independent checks, because either alone has a hole. NODE_ENV is the
 * declared intent, but a laptop with NODE_ENV unset and a production
 * DATABASE_URL pasted in is the likelier accident, so the connection string is
 * inspected too.
 *
 *   node scripts/guard-destructive.js <command-label>
 *
 * Exits 0 to allow, 1 to refuse.
 */
import dotenv from "dotenv";

dotenv.config();

const label = process.argv[2] || "This command";

const refuse = (reason, remedy) => {
  console.error(
    `\n  ✖ ${label} is blocked.\n\n` +
      `    ${reason}\n\n` +
      `    ${remedy}\n`
  );
  process.exit(1);
};

if (process.env.NODE_ENV === "production") {
  refuse(
    "NODE_ENV is set to production.",
    "Destructive database commands are never run against production.\n" +
      "    Apply schema changes with `npx prisma migrate deploy`, which only\n" +
      "    applies existing migrations and never drops or reseeds anything."
  );
}

/**
 * Hosts that are unambiguously a developer's own machine. Anything else —
 * a managed Postgres, a colleague's box, a tunnel — is treated as real until
 * the operator says otherwise.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal", "db", "postgres"]);

const url = process.env.DATABASE_URL;
if (url && process.env.ALLOW_REMOTE_DB !== "1") {
  let host = null;
  try {
    host = new URL(url).hostname;
  } catch {
    // An unparseable URL is not evidence of safety.
    refuse(
      "DATABASE_URL could not be parsed, so it cannot be confirmed local.",
      "Check the connection string, or set ALLOW_REMOTE_DB=1 if you are sure."
    );
  }

  if (!LOCAL_HOSTS.has(host)) {
    refuse(
      `DATABASE_URL points at "${host}", which is not a local database.`,
      "If that really is a throwaway database you mean to wipe, re-run with\n" +
        "    ALLOW_REMOTE_DB=1 — but never against one holding real school data."
    );
  }
}

console.log(`  ✓ ${label}: local database, not production — proceeding.`);
