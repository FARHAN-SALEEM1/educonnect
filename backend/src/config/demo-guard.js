import bcrypt from "bcryptjs";
import { env } from "./env.js";
import { prismaRaw } from "./prisma.js";

/**
 * Refuses to serve production with demo credentials in the database.
 *
 * The seed already cannot run in production — `guard-destructive.js` blocks
 * the npm script and `seed.js` carries its own check. That closes one route.
 * It does not close the likely one: wanting data to demonstrate, taking a dump
 * of the development database, and restoring it into production. Nothing about
 * a restore knows what it is carrying, and the result is
 * `sa@educonnect.io / super123` — a super admin over every institute, whose
 * password is printed in this repository's README — reachable from the
 * internet.
 *
 * So this checks the state rather than the route, at the only moment where
 * refusing still costs nothing: before the first request is served.
 *
 * Two questions, because either alone has a hole:
 *
 *   1. Do the seeded accounts exist by name? Cheap, exact, and catches a
 *      restored dump untouched — which is the case that actually happens.
 *   2. Does any SUPERADMIN still use one of the four documented passwords?
 *      Catches the same account renamed, which the first question would miss.
 *      Bounded work: a platform has a handful of super admins, not thousands.
 *
 * Development is left alone entirely. The demo data is the point there, and
 * the whole test suite signs in with exactly these credentials.
 */

/** Every login `prisma/seed.js` creates. */
const SEEDED_EMAILS = [
  "sa@educonnect.io",
  "admin@bhs.edu",
  "admin@lacas.edu",
  "admin@citys.edu",
  "admin@beaconhouse.edu",
  "hassan@bhs.edu",
  "ali.t@bhs.edu",
  "sara.t@bhs.edu",
  "fatima@bhs.edu",
  "nadia@bhs.edu",
  "hina@bhs.edu",
  "hira@bhs.edu",
  "sara@gmail.com",
  "ali@gmail.com",
  "nida@gmail.com",
];

/** The four passwords printed in the README and on the development login screen. */
const DOCUMENTED_PASSWORDS = ["super123", "admin123", "teach123", "parent123"];

const refuse = (lines) => {
  console.error(
    "\n[demo-guard] Refusing to start: this production database still holds demo credentials.\n" +
      lines.map((l) => `  - ${l}`).join("\n") +
      "\n\n" +
      "  These passwords are published in the README and on the development\n" +
      "  login screen. `sa@educonnect.io` is a super admin over every institute.\n\n" +
      "  Delete these accounts, or give them real passwords, before serving\n" +
      "  anyone. If this database came from a development dump, that is the\n" +
      "  thing to fix — a demo dump is not a starting point for production.\n"
  );
  process.exit(1);
};

export const assertNoDemoAccounts = async () => {
  if (!env.isProd) return;

  const problems = [];

  const seeded = await prismaRaw.user.findMany({
    where: { email: { in: SEEDED_EMAILS } },
    select: { email: true, role: true },
  });
  for (const u of seeded) problems.push(`${u.email} (${u.role}) is a seeded demo account`);

  /**
   * Renamed but not repassworded. Only super admins are checked: they are few,
   * and they are the ones worth the bcrypt comparisons.
   */
  const supers = await prismaRaw.user.findMany({
    where: { role: "SUPERADMIN" },
    select: { email: true, passwordHash: true },
  });
  for (const u of supers) {
    if (seeded.some((s) => s.email === u.email)) continue; // already reported
    for (const password of DOCUMENTED_PASSWORDS) {
      if (await bcrypt.compare(password, u.passwordHash)) {
        problems.push(`${u.email} (SUPERADMIN) still uses a documented demo password`);
        break;
      }
    }
  }

  if (problems.length) refuse(problems);
};
