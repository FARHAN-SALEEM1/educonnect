import { Router } from "express";
import * as ctrl from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  accountLimiter,
  authLimiter,
  passwordChangeLimiter,
  refreshLimiter,
} from "../middleware/rateLimit.js";
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

// Two layers on the credential routes: a generous per-network ceiling, and a
// tight per-account one that a botnet can't spread its way around.
router.post("/login", authLimiter, accountLimiter, validate(loginSchema), ctrl.login);
router.post("/signup", authLimiter, accountLimiter, validate(signupSchema), ctrl.signup);
router.post("/refresh", refreshLimiter, validate(refreshSchema), ctrl.refresh);
router.post("/logout", ctrl.logout);

// Rate-limited: both are unauthenticated and touch account state.
router.post(
  "/forgot-password",
  authLimiter,
  accountLimiter,
  validate(forgotPasswordSchema),
  ctrl.forgotPassword
);
/**
 * Reset carries a token, not an email, so there is no account to key on and
 * `accountLimiter` would skip it anyway. The per-IP limit is the control here,
 * and guessing a 64-hex-character single-use token is not a realistic attack
 * to begin with.
 */
router.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  ctrl.resetPassword
);

router.get("/me", authenticate, ctrl.me);
router.patch("/me", authenticate, validate(updateProfileSchema), ctrl.updateProfile);
// The limiter sits after `authenticate` so it can key on the account rather
// than the network — a stolen session guessing the current password holds one
// account however many addresses it comes from.
router.post(
  "/change-password",
  authenticate,
  passwordChangeLimiter,
  validate(changePasswordSchema),
  ctrl.changePassword
);

export default router;
