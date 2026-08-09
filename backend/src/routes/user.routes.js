import { Router } from "express";
import * as ctrl from "../controllers/user.controller.js";
import { authenticate, authorize, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  adminResetPasswordSchema,
  createUserSchema,
  updateUserSchema,
} from "../validators/institute.schema.js";

const router = Router();

router.use(authenticate, authorize("SUPERADMIN", "ADMIN"), scopeToInstitute);

router.get("/", ctrl.listUsers);
router.get("/:id", ctrl.getUser);
router.post("/", validate(createUserSchema), ctrl.createUser);
router.patch("/:id", validate(updateUserSchema), ctrl.updateUser);
router.post("/:id/reset-password", validate(adminResetPasswordSchema), ctrl.resetPassword);
router.delete("/:id", ctrl.deleteUser);

export default router;
