import { Router } from "express";
import * as ctrl from "../controllers/class.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  assignStudentsSchema,
  createClassSchema,
  updateClassSchema,
} from "../validators/academic.schema.js";

const router = Router();

router.use(authenticate);

/**
 * Reading the class list is open to every signed-in role — a teacher's class
 * picker and a parent's "which class is my child in" both need it, and
 * `scopeToInstitute` keeps each caller inside their own school.
 *
 * Everything that writes is ADMIN/SUPERADMIN only.
 */
router.get("/", scopeToInstitute, ctrl.listClasses);
router.get("/:id", scopeToInstitute, ctrl.getClass);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN"),
  validate(createClassSchema),
  requireInstitute,
  ctrl.createClass
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateClassSchema),
  scopeToInstitute,
  ctrl.updateClass
);

// Archive/restore rather than DELETE — a class is referenced by history.
router.patch("/:id/archive", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.archiveClass);

router.post(
  "/:id/students",
  authorize("SUPERADMIN", "ADMIN"),
  validate(assignStudentsSchema),
  scopeToInstitute,
  ctrl.assignStudents
);

export default router;
