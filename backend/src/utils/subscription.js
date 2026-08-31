import { ApiError } from "./ApiError.js";
import { count } from "./plural.js";

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
        : `This would add ${adding} students but only ${count(free,"seat")} ${free===1?"remains":"remain"} of ${limit}${custom}.`
    );
  }
};

/** True while a cancelled subscription is still inside its paid period. */
export const isInGracePeriod = (institute) =>
  Boolean(institute?.cancelAtPeriodEnd && institute?.subscriptionEndsAt && institute.subscriptionEndsAt > new Date());

/**
 * A cancelled subscription whose paid period has now passed.
 *
 * Computed live rather than trusting `status`, so expiry takes effect the
 * moment the date passes — not whenever the background sweep next runs.
 * The sweep exists to keep the stored status honest for listings/reports.
 */
export const hasExpired = (institute) =>
  Boolean(
    institute?.cancelAtPeriodEnd &&
      institute?.subscriptionEndsAt &&
      institute.subscriptionEndsAt <= new Date()
  );

/**
 * A free trial whose window has closed.
 *
 * `trialEndsAt` was written at signup and then read nowhere, so every trial
 * ran forever. A null date means the institute is not on a trial at all —
 * either it never was (seeded and platform-created schools) or it has been
 * converted — and such an institute is never blocked by this rule.
 *
 * Like `hasExpired`, this is computed from the date on every request rather
 * than trusted from a stored status, so it takes effect the moment the window
 * closes instead of whenever the background sweep next runs.
 */
export const hasTrialExpired = (institute) =>
  Boolean(institute?.trialEndsAt && institute.trialEndsAt <= new Date());

/**
 * The single source of truth for "can this institute be used right now".
 * Returns null when access is fine, or a { status, message } to block with.
 *
 * Order matters: a school that is suspended or closed is told that, not that
 * its trial lapsed, and an unapproved signup is never described as "expired".
 */
export const accessBlock = (institute) => {
  if (!institute) return { status: "MISSING", message: "Your institute no longer exists" };

  if (institute.status === "SUSPENDED") {
    return {
      status: "SUSPENDED",
      message: "Your institute account has been suspended. Please contact the administrator.",
    };
  }
  if (institute.status === "CANCELLED") {
    return {
      status: "CANCELLED",
      message: "Your institute account has been closed. Please contact the administrator.",
    };
  }
  // Self-service signups land in PENDING and must stay locked until a super
  // admin approves them. Without this branch the approval step existed in the
  // schema and in the signup comment but nowhere in the code: a brand-new
  // signup could log in and read and write immediately, on whichever plan it
  // had picked for itself.
  if (institute.status === "PENDING") {
    return {
      status: "PENDING",
      message:
        "Your institute is awaiting approval. You'll be able to sign in once the EduConnect team activates it.",
    };
  }
  if (institute.status === "EXPIRED" || hasExpired(institute)) {
    return {
      status: "EXPIRED",
      message:
        "Your subscription has expired. Please renew it from the admin portal, or contact the administrator.",
    };
  }
  if (hasTrialExpired(institute)) {
    return {
      status: "TRIAL_EXPIRED",
      message:
        "Your free trial has ended. Please subscribe to continue, or contact the administrator.",
    };
  }
  if (hasLapsedPayment(institute)) {
    return {
      status: "PAYMENT_REQUIRED",
      message:
        "We couldn't take payment for this period. Please update your payment details to continue.",
    };
  }
  return null;
};

/** Payment states that mean the gateway is not currently collecting money. */
const UNPAID_STATES = new Set(["UNPAID", "PAST_DUE", "CANCELED"]);

/**
 * A gateway-billed institute whose paid period has run out.
 *
 * The guard on `paymentProvider` is the important part. Every institute that
 * predates billing is `NONE`, and a school paying by bank transfer is
 * `MANUAL`; both carry `paymentStatus: UNPAID` because nothing has ever set it,
 * and neither must be locked out on that basis. Only an institute that
 * genuinely signed up through a gateway is judged on payment state.
 *
 * Access also survives to `currentPeriodEnd` even after a failed payment —
 * the school has already paid for that period, and cutting them off mid-month
 * over a card that expired is both wrong and the fastest way to lose them.
 */
export const hasLapsedPayment = (institute) => {
  const provider = institute?.paymentProvider;
  if (!provider || provider === "NONE" || provider === "MANUAL") return false;
  if (!UNPAID_STATES.has(institute?.paymentStatus)) return false;

  // No period recorded yet means checkout never completed; nothing to protect.
  if (!institute?.currentPeriodEnd) return false;
  return institute.currentPeriodEnd <= new Date();
};

/** Statuses a super admin may still act on — nothing is hidden from them. */
export const SUBSCRIPTION_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED"];

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
