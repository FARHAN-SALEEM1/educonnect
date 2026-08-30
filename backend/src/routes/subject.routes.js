import { Router } from "express";
import * as ctrl from "../controllers/subject.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  bulkEnrollSchema,
  createSubjectSchema,
  enrollSchema,
  updateEnrollmentSchema,
  updateSubjectSchema,
} from "../validators/academic.schema.js";

const router = Router();

router.use(authenticate);

// Enrollment endpoints first — "enroll"/"enrollments" must not be
// swallowed by the "/:id" subject routes below.
router.post(
  "/enroll",
  authorize("SUPERADMIN", "ADMIN"),
  validate(enrollSchema),
  requireInstitute,
  ctrl.enrollStudent
);
router.post(
  "/enroll/bulk",
  authorize("SUPERADMIN", "ADMIN"),
  validate(bulkEnrollSchema),
  requireInstitute,
  ctrl.bulkEnroll
);
router.patch(
  "/enrollments/:id",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  validate(updateEnrollmentSchema),
  scopeToInstitute,
  ctrl.updateEnrollment
);
router.delete(
  "/enrollments/:id",
  authorize("SUPERADMIN", "ADMIN"),
  scopeToInstitute,
  ctrl.unenroll
);

router.get("/", scopeToInstitute, ctrl.listSubjects);
router.get("/:id", scopeToInstitute, ctrl.getSubject);

// The subject's own teacher may do this too: they can already set any score
// by hand, so recomputing from marks takes nothing away from them.
router.post(
  "/:id/recalculate",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  scopeToInstitute,
  ctrl.recalculateSubject
);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN"),
  validate(createSubjectSchema),
  requireInstitute,
  ctrl.createSubject
);
router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateSubjectSchema),
  scopeToInstitute,
  ctrl.updateSubject
);
router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteSubject);

export default router;
