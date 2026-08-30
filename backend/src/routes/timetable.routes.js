import { Router } from "express";
import * as ctrl from "../controllers/timetable.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  scheduleSlotSchema,
  timetableSlotSchema,
  updateScheduleSlotSchema,
  updateTimetableSlotSchema,
} from "../validators/academic.schema.js";

const router = Router();

router.use(authenticate);

router.get("/", scopeToInstitute, ctrl.getTimetable);

/**
 * Admin scheduling. Registered before "/:id" so "schedule" is not swallowed as
 * a slot id — Express matches in declaration order and a literal path has to
 * come first.
 */
router.get("/schedule", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.getSchedule);

router.post(
  "/schedule",
  authorize("SUPERADMIN", "ADMIN"),
  validate(scheduleSlotSchema),
  requireInstitute,
  ctrl.createScheduledSlot
);

router.patch(
  "/schedule/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateScheduleSlotSchema),
  scopeToInstitute,
  ctrl.updateScheduledSlot
);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN"),
  validate(timetableSlotSchema),
  requireInstitute,
  ctrl.createSlot
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateTimetableSlotSchema),
  scopeToInstitute,
  ctrl.updateSlot
);

router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteSlot);

export default router;
