import { Router } from "express";
import * as ctrl from "../controllers/student.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createStudentSchema,
  importStudentsSchema,
  promoteStudentsSchema,
  studentQuery,
  updateStudentSchema,
} from "../validators/people.schema.js";

const router = Router();

router.use(authenticate);

// Every role can list students — `studentScopeWhere` narrows the rows:
// admins see the institute, teachers see their classes, parents see their kids.
// Declared before "/:id" so "deleted" isn't read as a student id.
router.get(
  "/deleted",
  authorize("SUPERADMIN", "ADMIN"),
  requireInstitute,
  ctrl.listDeletedStudents
);
router.post(
  "/:id/restore",
  authorize("SUPERADMIN", "ADMIN"),
  requireInstitute,
  ctrl.restoreStudent
);
// The one endpoint that actually destroys something. It only accepts records
// already in the recycle bin, so the roster cannot reach it by mistake.
router.delete(
  "/:id/purge",
  authorize("SUPERADMIN", "ADMIN"),
  requireInstitute,
  ctrl.purgeStudent
);

router.get("/", validate(studentQuery, "query"), scopeToInstitute, ctrl.listStudents);
router.get("/:id", scopeToInstitute, ctrl.getStudent);
router.get("/:id/report", scopeToInstitute, ctrl.studentReport);
// Class history — anyone who may read the student may read where they have been.
router.get("/:id/promotions", scopeToInstitute, ctrl.studentPromotions);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN"),
  validate(createStudentSchema),
  requireInstitute,
  ctrl.createStudent
);

router.post(
  "/import",
  authorize("SUPERADMIN", "ADMIN"),
  validate(importStudentsSchema),
  requireInstitute,
  ctrl.importStudents
);

// The end-of-session move. Bulk and in-place, so it is the admin's call.
router.post(
  "/promote",
  authorize("SUPERADMIN", "ADMIN"),
  validate(promoteStudentsSchema),
  requireInstitute,
  ctrl.promoteStudents
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateStudentSchema),
  scopeToInstitute,
  ctrl.updateStudent
);

router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteStudent);

router.post(
  "/:id/insights",
  authorize("SUPERADMIN", "ADMIN", "TEACHER", "PARENT"),
  scopeToInstitute,
  ctrl.refreshInsights
);

export default router;
