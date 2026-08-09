import { Router } from "express";
import * as ctrl from "../controllers/message.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { messageQuery, replyMessageSchema, sendMessageSchema } from "../validators/ops.schema.js";

const router = Router();

router.use(authenticate);

// "contacts" and "read-all" must be declared before "/:id".
router.get("/contacts", ctrl.contacts);
router.patch("/read-all", ctrl.markAllRead);

router.get("/", validate(messageQuery, "query"), ctrl.listMessages);
router.get("/:id", ctrl.getMessage);

router.post("/", validate(sendMessageSchema), ctrl.sendMessage);
router.post("/:id/reply", validate(replyMessageSchema), ctrl.replyToMessage);

router.patch("/:id/read", ctrl.markRead);
router.delete("/:id", ctrl.deleteMessage);

export default router;
