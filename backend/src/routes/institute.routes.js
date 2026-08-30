import { Router } from "express";
import * as ctrl from "../controllers/institute.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  cancelSubscriptionSchema,
  changeMyPlanSchema,
  changePlanSchema,
  changeStatusSchema,
  changeStudentLimitSchema,
  createInstituteSchema,
  updateInstituteSchema,
} from "../validators/institute.schema.js";
import { requireInstitute } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

// ── Admin self-service subscription ──────────────────────────────────
// Declared before "/:id" so "me" is never read as an institute id.
// requireInstitute pins every one of these to the caller's own institute,
// so an admin can only ever change their own subscription.
router.get("/me/subscription", authorize("ADMIN", "SUPERADMIN"), requireInstitute, ctrl.mySubscription);

router.get(
  "/me/notifications",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.getNotificationSettings
);
router.patch(
  "/me/notifications",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.updateNotificationSettings
);

// The academic session. Reading it is open to anyone signed into the school —
// a result card header needs it. Changing it is the admin's.
router.get("/me/session", requireInstitute, ctrl.getSession);
router.patch(
  "/me/session",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.updateSession
);

// A school's own year: April-to-March by default, but a Karachi or
// Cambridge-track school running August-to-July sets its own here.
// A school names its own terms, and names them within one year.
router.get(
  "/me/sessions/:id/terms",
  authorize("ADMIN", "SUPERADMIN", "TEACHER"),
  requireInstitute,
  ctrl.listSessionTerms
);
router.post(
  "/me/sessions/:id/terms",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.createSessionTerm
);
// Before "/:termId", so the literal "order" is not read as a term id.
router.patch(
  "/me/sessions/:id/terms/order",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.reorderSessionTerms
);
router.patch(
  "/me/sessions/:id/terms/:termId",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.updateSessionTerm
);
router.delete(
  "/me/sessions/:id/terms/:termId",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.deleteSessionTerm
);

router.get(
  "/me/grading",
  authorize("ADMIN", "SUPERADMIN", "TEACHER"),
  requireInstitute,
  ctrl.getGradingSettings
);

// A+ at 90 or at 80, a pass at 33 or at 40 — every school decides its own.
router.patch(
  "/me/grading",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.updateGradingSettings
);

router.patch(
  "/me/sessions/:id",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.updateSessionDates
);

router.post(
  "/me/subscription/plan",
  authorize("ADMIN", "SUPERADMIN"),
  validate(changeMyPlanSchema),
  requireInstitute,
  ctrl.changeMyPlan
);

router.patch(
  "/me/subscription/limit",
  authorize("ADMIN", "SUPERADMIN"),
  validate(changeStudentLimitSchema),
  requireInstitute,
  ctrl.changeMyStudentLimit
);

router.post(
  "/me/subscription/cancel",
  authorize("ADMIN", "SUPERADMIN"),
  validate(cancelSubscriptionSchema),
  requireInstitute,
  ctrl.cancelMySubscription
);

router.post(
  "/me/subscription/resume",
  authorize("ADMIN", "SUPERADMIN"),
  requireInstitute,
  ctrl.resumeMySubscription
);

router.get("/", authorize("SUPERADMIN"), ctrl.listInstitutes);
router.post("/", authorize("SUPERADMIN"), validate(createInstituteSchema), ctrl.createInstitute);

// "deleted" before "/:id" so it isn't captured as an id.
router.get("/deleted", authorize("SUPERADMIN"), ctrl.listDeletedInstitutes);
router.post("/:id/restore", authorize("SUPERADMIN"), ctrl.restoreInstitute);
router.delete("/:id/purge", authorize("SUPERADMIN"), ctrl.purgeInstitute);

// Admins may read and edit their own institute; the guards live in the controller.
router.get("/:id", authorize("SUPERADMIN", "ADMIN"), ctrl.getInstitute);
router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateInstituteSchema),
  ctrl.updateInstitute
);

router.patch("/:id/plan", authorize("SUPERADMIN"), validate(changePlanSchema), ctrl.changePlan);
router.patch(
  "/:id/status",
  authorize("SUPERADMIN"),
  validate(changeStatusSchema),
  ctrl.changeStatus
);
router.delete("/:id", authorize("SUPERADMIN"), ctrl.deleteInstitute);

export default router;
