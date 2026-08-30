import { prismaRaw } from "../../src/config/prisma.js";

/**
 * Is the demo seed actually in this database?
 *
 * Most specs here build a throwaway school in `beforeAll`, set a `seeded` flag,
 * and open every test with `if (skip()) return`. That exists so the suite can
 * stand down on a machine that was never seeded — a reasonable thing to want.
 *
 * The trouble is that the same flag goes false when a spec's *own* setup breaks,
 * and then every one of those early returns is reported as a passing test. A
 * file can go completely vacuous and still show a column of green ticks. That
 * happened in this repo on 2026-08-30: `removedteacher.test.js` was missing a
 * required field on one request, its whole setup failed, and it reported seven
 * passes — including four that were supposed to be catching a live bug. The bug
 * was real; the file simply never looked.
 *
 * This separates the two cases. No seed data — stand down, as intended. Seed
 * data present but `seeded` false — the setup broke, and the file must say so
 * rather than pass emptily.
 *
 * Used as:
 *
 *     it("built its fixtures", async () => {
 *       const { seedPresent } = await import("./helpers/fixtures.js");
 *       if (!(await seedPresent())) return;
 *       expect(seeded, "beforeAll did not complete …").toBe(true);
 *     });
 *
 * The import is dynamic so the guard is one self-contained block per file,
 * with nothing to add to the import list at the top.
 */
export const seedPresent = async () =>
  Boolean(
    await prismaRaw.institute.findFirst({
      where: { code: "INS001" },
      select: { id: true },
    })
  );
