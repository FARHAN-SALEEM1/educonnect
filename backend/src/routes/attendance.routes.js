import { Router } from "express";
import * as ctrl from "../controllers/attendance.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  attendanceQuery,
  bulkAttendanceSchema,
  markAttendanceSchema,
} from "../validators/ops.schema.js";

const router = Router();

router.use(authenticate);

// Static paths before "/:id".
router.get(
  "/register",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  scopeToInstitute,
  ctrl.register
);
router.get("/summary", validate(attendanceQuery, "query"), scopeToInstitute, ctrl.summary);

router.get("/", validate(attendanceQuery, "query"), scopeToInstitute, ctrl.listAttendance);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  validate(markAttendanceSchema),
  requireInstitute,
  ctrl.markOne
);

router.post(
  "/bulk",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  validate(bulkAttendanceSchema),
  requireInstitute,
  ctrl.markBulk
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  scopeToInstitute,
  ctrl.updateAttendance
);

router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteAttendance);

export default router;
