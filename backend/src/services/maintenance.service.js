import { prisma } from "../config/prisma.js";

/**
 * Housekeeping that would otherwise grow unbounded.
 *
 * Every login writes a refresh-token row, and rotation writes another. Without
 * a sweep the table grows forever — on a busy school that is thousands of dead
 * rows a week, all of them indexed.
 */
export async function purgeExpiredTokens() {
  const cutoff = new Date();
  // Keep recently-revoked rows briefly: they make token-reuse attacks visible
  // in the audit trail rather than silently absent.
  const revokedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: revokedCutoff } }],
    },
  });

  if (count) console.log(`[maintenance] purged ${count} expired refresh token(s)`);
  return count;
}

/** Expired password-reset links are useless; don't keep them around. */
export async function purgeExpiredResetTokens() {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
    },
  });

  if (count) console.log(`[maintenance] purged ${count} used/expired reset token(s)`);
  return count;
}

/**
 * Runs the sweeps on an interval. Deliberately in-process rather than a cron
 * container: one less moving part to deploy, and the work is trivial.
 */
export function startMaintenance({ intervalHours = 6 } = {}) {
  const run = async () => {
    try {
      await purgeExpiredTokens();
      await purgeExpiredResetTokens();
    } catch (err) {
      console.error("[maintenance] sweep failed:", err.message);
    }
  };

  run();
  const timer = setInterval(run, intervalHours * 60 * 60 * 1000);
  // Don't hold the process open on shutdown.
  timer.unref();
  return timer;
}
