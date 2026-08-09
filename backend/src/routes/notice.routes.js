import { Router } from "express";
import * as ctrl from "../controllers/notice.controller.js";
import { authenticate, authorize, requireInstitute, scopeToInstitute } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  broadcastNoticeSchema,
  createNoticeSchema,
  noticeQuery,
  updateNoticeSchema,
} from "../validators/ops.schema.js";

const router = Router();

router.use(authenticate);

// Declared before "/:id" so "broadcast" isn't captured as an id.
router.post(
  "/broadcast",
  authorize("SUPERADMIN"),
  validate(broadcastNoticeSchema),
  ctrl.broadcastNotice
);

router.get("/", validate(noticeQuery, "query"), scopeToInstitute, ctrl.listNotices);
router.get("/:id", scopeToInstitute, ctrl.getNotice);

router.post(
  "/",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  validate(createNoticeSchema),
  requireInstitute,
  ctrl.createNotice
);

router.patch(
  "/:id",
  authorize("SUPERADMIN", "ADMIN", "TEACHER"),
  validate(updateNoticeSchema),
  scopeToInstitute,
  ctrl.updateNotice
);

router.delete("/:id", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.deleteNotice);

export default router;
