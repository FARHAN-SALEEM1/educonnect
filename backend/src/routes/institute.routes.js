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
