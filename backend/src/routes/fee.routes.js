import { Router } from "express";
import * as ctrl from "../controllers/fee.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createInvoiceSchema,
  feeQuery,
  generateInvoicesSchema,
  payInvoiceSchema,
} from "../validators/ops.schema.js";

const router = Router();

router.use(authenticate);

// Static paths before "/:id" so they aren't captured as ids.
router.get("/stats", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.feeStats);

router.post(
  "/generate",
  authorize("SUPERADMIN", "ADMIN"),
  validate(generateInvoicesSchema),
  requireInstitute,
  ctrl.generateInvoices
);

router.post(
  "/mark-overdue",
  authorize("SUPERADMIN", "ADMIN"),
  scopeToInstitute,
  ctrl.markOverdue
);

router.get("/", validate(feeQuery, "query"), scopeToInstitute, ctrl.listInvoices);
router.get("/:id", scopeToInstitute, ctrl.getInvoice);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN"),
  validate(createInvoiceSchema),
  requireInstitute,
  ctrl.createInvoice
);

router.post(
  "/:id/pay",
  authorize("SUPERADMIN", "ADMIN"),
  validate(payInvoiceSchema),
  scopeToInstitute,
  ctrl.payInvoice
);

router.patch("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.updateInvoice);
router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteInvoice);

export default router;
