import { ApiError } from "./ApiError.js";

/**
 * Subscription rules in one place.
 *
 * The seat cap was previously read straight off `plan.maxStudents` at every
 * call site, so a school that asked for 150 seats still saw its plan's 800.
 * Everything now goes through `effectiveStudentLimit`, which prefers the
 * institute's own `studentLimit` and falls back to the plan.
 */

/**
 * @param {{ studentLimit?: number|null, plan?: { maxStudents: number } }} institute
 * @returns {number} the seat cap actually in force
 */
export const effectiveStudentLimit = (institute) => {
  const planCap = institute?.plan?.maxStudents ?? 0;
  const own = institute?.studentLimit;

  if (own === null || own === undefined) return planCap;
  // A plan downgrade must never leave a school with more seats than it pays for.
  return Math.min(own, planCap);
};

/** Seats left, floored at 0 so a shrunken plan can't report a negative. */
export const seatsRemaining = (institute, currentStudents) =>
  Math.max(0, effectiveStudentLimit(institute) - currentStudents);

/**
 * Throws if adding `adding` students would exceed the cap. Used by both
 * single creation and CSV import so they can't diverge.
 */
export const assertSeatsAvailable = (institute, currentStudents, adding = 1) => {
  const limit = effectiveStudentLimit(institute);
  const free = Math.max(0, limit - currentStudents);

  if (adding > free) {
    const planName = institute?.plan?.name ?? "current";
    const custom =
      institute?.studentLimit != null && institute.studentLimit < (institute?.plan?.maxStudents ?? 0)
        ? ` (your institute is capped at ${limit}, below the ${planName} plan's ${institute.plan.maxStudents})`
        : ` on the ${planName} plan`;

    throw ApiError.badRequest(
      adding === 1
        ? `Student limit reached — ${currentStudents} of ${limit} seats used${custom}. Upgrade the plan or raise the limit to add more.`
        : `This would add ${adding} students but only ${free} seat(s) remain of ${limit}${custom}.`
    );
  }
};

/** True while a cancelled subscription is still inside its paid period. */
export const isInGracePeriod = (institute) =>
  Boolean(institute?.cancelAtPeriodEnd && institute?.subscriptionEndsAt && institute.subscriptionEndsAt > new Date());

/** Last moment of the current calendar month — when an end-of-period cancel lands. */
export const endOfCurrentPeriod = (from = new Date()) =>
  new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0, 23, 59, 59, 999));

/**
 * Shape the subscription block every portal reads, so the dashboard, the
 * super-admin list and the settings page can't disagree.
 */
export const subscriptionSummary = (institute, studentCount) => {
  const limit = effectiveStudentLimit(institute);
  return {
    plan: institute.plan
      ? {
          id: institute.plan.id,
          name: institute.plan.name,
          price: institute.plan.price,
          maxStudents: institute.plan.maxStudents,
          color: institute.plan.color,
          features: institute.plan.features,
        }
      : null,
    studentLimit: limit,
    customLimit: institute.studentLimit ?? null,
    seatsUsed: studentCount,
    seatsRemaining: Math.max(0, limit - studentCount),
    status: institute.status,
    cancelAtPeriodEnd: institute.cancelAtPeriodEnd ?? false,
    subscriptionEndsAt: institute.subscriptionEndsAt ?? null,
    inGracePeriod: isInGracePeriod(institute),
  };
};
