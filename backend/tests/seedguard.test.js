import { afterAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prismaRaw } from "../src/config/prisma.js";

/**
 * Production must not be seedable, resettable, or told the demo passwords.
 *
 * The seed creates `sa@educonnect.io` / `super123` — a super admin over every
 * institute — plus admin/teacher/parent accounts whose passwords are printed
 * in this repository, in the README, and (in development) on the login screen.
 * Run against a live deployment it would either destroy a school's records or
 * hand the platform to anyone who has read the docs.
 *
 * These tests run the real scripts as separate processes, because that is how
 * the accident happens: someone types `npm run db:seed` with the wrong
 * environment loaded.
 */

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..");
const FRONTEND = path.resolve(BACKEND, "..", "frontend");

/** Runs a node script and resolves with its exit code and output, never throws. */
const node = async (script, env = {}, args = []) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args], {
      cwd: BACKEND,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
};

const LOCAL_DB = process.env.DATABASE_URL ?? "postgresql://u:p@localhost:5432/educonnect_v2";

describe("the seed refuses to run in production", () => {
  it("exits non-zero instead of seeding", async () => {
    const res = await node("prisma/seed.js", { NODE_ENV: "production" });
    expect(res.code).not.toBe(0);
  });

  it("says why, and names the risk", async () => {
    const res = await node("prisma/seed.js", { NODE_ENV: "production" });
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toMatch(/refusing to seed/i);
    expect(out).toMatch(/NODE_ENV is production/i);
    expect(out).toMatch(/migrate deploy/i); // points at the safe alternative
  });

  /**
   * ⚠ Row counts alone cannot prove this. The seed wipes the tables it owns
   * and recreates the same fixtures, so a successful run leaves the counts
   * *identical* — an earlier version of this test compared only counts, passed
   * against a disabled guard, and missed a real wipe-and-reseed. Identity is
   * what changes: every id is regenerated. So the check is on a stable id.
   *
   * ⚠ If you ever disable the guard to watch these tests fail, this test WILL
   * wipe your database, because it runs the real seed.
   */
  it("leaves the database untouched, identity and all", async () => {
    const before = await prismaRaw.institute.findFirst({
      where: { code: "INS001" },
      select: { id: true, createdAt: true },
    });
    const counts = {
      institutes: await prismaRaw.institute.count(),
      users: await prismaRaw.user.count(),
      students: await prismaRaw.student.count(),
    };

    await node("prisma/seed.js", { NODE_ENV: "production" });

    const after = await prismaRaw.institute.findFirst({
      where: { code: "INS001" },
      select: { id: true, createdAt: true },
    });
    // A reseed would hand INS001 a brand-new cuid and timestamp.
    expect(after?.id, "the institute was recreated — the seed ran").toBe(before?.id);
    expect(after?.createdAt?.toISOString()).toBe(before?.createdAt?.toISOString());
    expect({
      institutes: await prismaRaw.institute.count(),
      users: await prismaRaw.user.count(),
      students: await prismaRaw.student.count(),
    }).toEqual(counts);
  });

  it("blocks even when invoked directly, bypassing npm", async () => {
    // `node prisma/seed.js` skips the npm script and its guard, so the file
    // carries its own check.
    const res = await node("prisma/seed.js", { NODE_ENV: "production" });
    expect(res.code).not.toBe(0);
  });
});

describe("destructive commands refuse production", () => {
  const GUARD = "scripts/guard-destructive.js";

  it("blocks when NODE_ENV is production", async () => {
    const res = await node(GUARD, { NODE_ENV: "production", DATABASE_URL: LOCAL_DB }, ["db:reset"]);
    expect(res.code).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/NODE_ENV is set to production/i);
  });

  it("blocks production even with ALLOW_REMOTE_DB set", async () => {
    // The remote-database escape hatch must not also unlock production.
    const res = await node(
      GUARD,
      { NODE_ENV: "production", ALLOW_REMOTE_DB: "1", DATABASE_URL: LOCAL_DB },
      ["db:reset"]
    );
    expect(res.code).not.toBe(0);
  });

  it("blocks a non-local database even when NODE_ENV is unset", async () => {
    const res = await node(
      GUARD,
      {
        NODE_ENV: "",
        ALLOW_REMOTE_DB: "",
        DATABASE_URL: "postgresql://u:p@ep-cool-name.eu-central-1.aws.neon.tech:5432/educonnect",
      },
      ["db:reset"]
    );
    expect(res.code).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/not a local database/i);
  });

  it("blocks an unparseable connection string rather than assuming it is safe", async () => {
    const res = await node(
      GUARD,
      { NODE_ENV: "", ALLOW_REMOTE_DB: "", DATABASE_URL: "not-a-url" },
      ["db:reset"]
    );
    expect(res.code).not.toBe(0);
  });

  it("allows a local database in development", async () => {
    const res = await node(
      GUARD,
      { NODE_ENV: "development", ALLOW_REMOTE_DB: "", DATABASE_URL: "postgresql://u:p@localhost:5432/educonnect_v2" },
      ["db:reset"]
    );
    expect(res.code, res.stderr).toBe(0);
  });

  it("names the command it blocked, so the message is actionable", async () => {
    const res = await node(GUARD, { NODE_ENV: "production" }, ["db:seed"]);
    expect(`${res.stdout}${res.stderr}`).toMatch(/db:seed/);
  });
});

describe("every destructive npm script is guarded", () => {
  const pkg = JSON.parse(readFileSync(path.join(BACKEND, "package.json"), "utf8"));

  it("routes reset, migrate, push, seed and setup through the guard", () => {
    for (const name of ["db:reset", "db:migrate", "db:push", "db:seed", "setup"]) {
      expect(pkg.scripts[name], `${name} must exist`).toBeTruthy();
      expect(pkg.scripts[name], `${name} must run the guard first`).toMatch(
        /^node scripts\/guard-destructive\.js/
      );
    }
  });

  it("leaves the non-destructive ones alone", () => {
    // `migrate deploy` only applies existing migrations, so production uses it.
    expect(pkg.scripts["db:deploy"]).toBe("prisma migrate deploy");
    expect(pkg.scripts.start).toBe("node src/server.js");
  });
});

// ── frontend bundle ───────────────────────────────────────────────────
/**
 * Builds the frontend and returns the concatenated JS output.
 *
 * NODE_ENV is pinned to production: vitest sets it to "test", and Vite reads
 * it when choosing a build mode, so inheriting it silently produces a
 * development bundle — one that still carries the demo credentials and would
 * make these assertions test the wrong artifact.
 */
/** The last build's environment, so `dist` can be put back afterwards. */
let lastBuiltWith = null;

const runViteBuild = async (env) => {
  // Vite is invoked directly rather than through `npm run build`: running an
  // .cmd shim needs a shell on Windows, and passing args through one is both
  // deprecated and needless here.
  await run(process.execPath, [path.join(FRONTEND, "node_modules", "vite", "bin", "vite.js"), "build"], {
    cwd: FRONTEND,
    env: { ...process.env, NODE_ENV: "production", ...env },
  });
  lastBuiltWith = JSON.stringify(env);

  const assets = path.join(FRONTEND, "dist", "assets");
  return readdirSync(assets)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(path.join(assets, f), "utf8"))
    .join("\n");
};

/**
 * One build per distinct environment, not one per assertion.
 *
 * Four tests below ask about the production bundle and one asks about the
 * demo-enabled one, which was five full Vite builds for two distinct
 * artifacts. Measured across the suite, this file was 34 seconds of 118 —
 * 29% of the whole run — and three of those builds produced output identical
 * to one already in hand.
 *
 * The cache is keyed on the environment, so a test asking for a different
 * build still gets a real one. What it must not do is leave `dist` holding
 * whatever was built last; see the afterAll below.
 */
const bundles = new Map();

const buildBundle = async (env = {}) => {
  const key = JSON.stringify(env);
  if (!bundles.has(key)) bundles.set(key, await runViteBuild(env));
  return bundles.get(key);
};

describe("a production build ships no demo credentials", () => {
  const SECRETS = ["super123", "admin123", "teach123", "parent123"];

  /**
   * Leave `dist` as an ordinary production build.
   *
   * These tests write real output into `frontend/dist`, and one of them builds
   * with the demo panel switched on. Before the bundles were cached the last
   * call in the file happened to be a plain rebuild, so the directory was left
   * safe by accident. Cached, that call returns without touching disk — and
   * `dist` would sit there carrying the demo credentials for anyone who
   * deployed it without rebuilding.
   *
   * Restoring costs one build and removes a way to ship the wrong artifact.
   */
  afterAll(async () => {
    if (lastBuiltWith !== null && lastBuiltWith !== "{}") await runViteBuild({});
  }, 240_000);

  it("contains none of the seeded passwords", async () => {
    const bundle = await buildBundle();
    for (const s of SECRETS) expect(bundle, `"${s}" must not ship`).not.toContain(s);
  }, 180_000);

  it("contains no Quick Login panel and no demo account list", async () => {
    const bundle = await buildBundle();
    expect(bundle).not.toContain("Quick Login");
    expect(bundle).not.toContain("Try a Demo Account");
    expect(bundle).not.toContain("sa@educonnect.io");
  }, 180_000);

  it("still ships the real login form", async () => {
    const bundle = await buildBundle();
    expect(bundle).toContain("Welcome back");
    expect(bundle).toContain("Forgot your password?");
  }, 180_000);

  it("puts the demo panel back only when explicitly asked at build time", async () => {
    const bundle = await buildBundle({ VITE_ENABLE_DEMO: "true" });
    expect(bundle).toContain("Quick Login");
    expect(bundle).toContain("super123");

    // …and leaves again when the flag is dropped, so the default is safe.
    const plain = await buildBundle();
    expect(plain).not.toContain("super123");
  }, 240_000);

  it("keeps the source gated rather than relying on minification alone", () => {
    const src = readFileSync(path.join(FRONTEND, "src", "App.jsx"), "utf8");
    expect(existsSync(path.join(FRONTEND, "src", "App.jsx"))).toBe(true);
    expect(src).toMatch(/DEMO_LOGINS_ENABLED\s*=/);
    expect(src).toMatch(/import\.meta\.env\.DEV/);
  });
});
