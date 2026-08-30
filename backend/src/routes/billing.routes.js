import { Router } from "express";
import * as ctrl from "../controllers/billing.controller.js";
import { authenticate, authorize, requireInstitute } from "../middleware/auth.js";

/**
 * Admin-facing billing. The webhook is NOT here — it is mounted separately in
 * app.js, ahead of the JSON body parser, because signature verification needs
 * the raw bytes.
 */
const router = Router();

router.use(authenticate, authorize("ADMIN", "SUPERADMIN"), requireInstitute);

router.get("/status", ctrl.billingStatus);
router.post("/checkout-session", ctrl.createCheckoutSession);
router.post("/cancel", ctrl.cancelSubscription);

export default router;
