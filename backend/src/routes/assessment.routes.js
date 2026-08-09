import { Router } from "express";
import * as ctrl from "../controllers/assessment.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  bulkAssessmentSchema,
  createAssessmentSchema,
  updateAssessmentSchema,
} from "../validators/academic.schema.js";

const router = Router();

router.use(authenticate);

router.get("/gradebook", authorize("SUPERADMIN", "ADMIN", "TEACHER"), scopeToInstitute, ctrl.gradebook);

router.get("/", scopeToInstitute, ctrl.listAssessments);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  validate(createAssessmentSchema),
  requireInstitute,
  ctrl.createAssessment
);

router.post(
  "/bulk",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  validate(bulkAssessmentSchema),
  requireInstitute,
  ctrl.bulkCreateAssessments
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  validate(updateAssessmentSchema),
  scopeToInstitute,
  ctrl.updateAssessment
);

router.delete(
  "/:id",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  scopeToInstitute,
  ctrl.deleteAssessment
);

export default router;
