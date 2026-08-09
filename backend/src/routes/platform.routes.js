import { Router } from "express";
import * as ctrl from "../controllers/platform.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  generateSubscriptionsSchema,
  platformSettingsSchema,
} from "../validators/platform.schema.js";

const router = Router();

// Everything here is platform-owner territory.
router.use(authenticate, authorize("SUPERADMIN"));

router.get("/settings", ctrl.getSettings);
router.patch("/settings", validate(platformSettingsSchema), ctrl.updateSettings);

export default router;

/** Subscription-invoice routes, mounted separately at /api/subscription-invoices. */
export const subscriptionRouter = Router();

subscriptionRouter.use(authenticate, authorize("SUPERADMIN"));
subscriptionRouter.get("/", ctrl.listSubscriptionInvoices);
subscriptionRouter.post(
  "/generate",
  validate(generateSubscriptionsSchema),
  ctrl.generateSubscriptionInvoices
);
subscriptionRouter.post("/:id/pay", ctrl.paySubscriptionInvoice);
