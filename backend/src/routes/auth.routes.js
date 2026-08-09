import { Router } from "express";
import * as ctrl from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { authLimiter } from "../middleware/rateLimit.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  signupSchema,
  updateProfileSchema,
} from "../validators/auth.schema.js";

const router = Router();

router.post("/login", authLimiter, validate(loginSchema), ctrl.login);
router.post("/signup", authLimiter, validate(signupSchema), ctrl.signup);
router.post("/refresh", validate(refreshSchema), ctrl.refresh);
router.post("/logout", ctrl.logout);

// Rate-limited: both are unauthenticated and touch account state.
router.post(
  "/forgot-password",
  authLimiter,
  validate(forgotPasswordSchema),
  ctrl.forgotPassword
);
router.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  ctrl.resetPassword
);

router.get("/me", authenticate, ctrl.me);
router.patch("/me", authenticate, validate(updateProfileSchema), ctrl.updateProfile);
router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  ctrl.changePassword
);

export default router;
