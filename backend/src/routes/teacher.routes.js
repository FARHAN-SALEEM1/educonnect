import { Router } from "express";
import * as ctrl from "../controllers/teacher.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createTeacherSchema, updateTeacherSchema } from "../validators/people.schema.js";

const router = Router();

router.use(authenticate);

// The signed-in teacher's own classes — declared before "/:id" for clarity.
router.get("/me/classes", authorize("TEACHER"), ctrl.myClasses);

router.get("/deleted", authorize("SUPERADMIN", "ADMIN"), requireInstitute, ctrl.listDeletedTeachers);
router.post("/:id/restore", authorize("SUPERADMIN", "ADMIN"), requireInstitute, ctrl.restoreTeacher);
// The one endpoint that actually destroys something. It only accepts records
// already in the recycle bin, so the roster cannot reach it by mistake.
router.delete("/:id/purge", authorize("SUPERADMIN", "ADMIN"), requireInstitute, ctrl.purgeTeacher);

router.get("/", scopeToInstitute, ctrl.listTeachers);
router.get("/:id", scopeToInstitute, ctrl.getTeacher);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN"),
  validate(createTeacherSchema),
  requireInstitute,
  ctrl.createTeacher
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateTeacherSchema),
  scopeToInstitute,
  ctrl.updateTeacher
);

router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteTeacher);

export default router;
