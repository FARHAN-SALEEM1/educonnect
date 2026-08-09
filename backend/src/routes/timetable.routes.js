import { Router } from "express";
import * as ctrl from "../controllers/timetable.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  timetableSlotSchema,
  updateTimetableSlotSchema,
} from "../validators/academic.schema.js";

const router = Router();

router.use(authenticate);

router.get("/", scopeToInstitute, ctrl.getTimetable);

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
