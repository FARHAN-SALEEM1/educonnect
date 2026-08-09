import { Router } from "express";
import * as ctrl from "../controllers/parent.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createParentSchema, updateParentSchema } from "../validators/people.schema.js";

const router = Router();

router.use(authenticate);

router.get("/me/children", authorize("PARENT"), ctrl.myChildren);

router.get("/deleted", authorize("SUPERADMIN", "ADMIN"), requireInstitute, ctrl.listDeletedParents);
router.post("/:id/restore", authorize("SUPERADMIN", "ADMIN"), requireInstitute, ctrl.restoreParent);

router.get("/", authorize("SUPERADMIN", "ADMIN", "TEACHER"), scopeToInstitute, ctrl.listParents);
router.get("/:id", authorize("SUPERADMIN", "ADMIN", "TEACHER"), scopeToInstitute, ctrl.getParent);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN"),
  validate(createParentSchema),
  requireInstitute,
  ctrl.createParent
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateParentSchema),
  scopeToInstitute,
  ctrl.updateParent
);

router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteParent);

export default router;
