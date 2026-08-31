import { Router } from "express";
import * as ctrl from "../controllers/branch.controller.js";
import { authenticate, authorize, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createBranchSchema,
  reassignSchema,
  updateBranchSchema,
} from "../validators/branch.schema.js";

const router = Router();

router.use(authenticate);

/**
 * Every route is scoped to the institute, because a campus only means anything
 * inside one school. Teachers may read the list — a roster filter needs it —
 * but only an admin opens, renames or closes a campus.
 */
router.get("/", scopeToInstitute, ctrl.listBranches);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN"),
  validate(createBranchSchema),
  scopeToInstitute,
  ctrl.createBranch
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN"),
  validate(updateBranchSchema),
  scopeToInstitute,
  ctrl.updateBranch
);

router.post(
  "/:id/reassign",
  authorize("SUPERADMIN", "ADMIN"),
  validate(reassignSchema),
  scopeToInstitute,
  ctrl.reassignToBranch
);

router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteBranch);

export default router;
