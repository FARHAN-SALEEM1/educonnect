import { Router } from "express";
import * as ctrl from "../controllers/dashboard.controller.js";
import { authenticate, authorize, scopeToInstitute } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

router.get("/superadmin", authorize("SUPERADMIN"), ctrl.superAdminDashboard);
router.get("/admin", authorize("SUPERADMIN", "ADMIN"), scopeToInstitute, ctrl.adminDashboard);
router.get("/teacher", authorize("TEACHER"), ctrl.teacherDashboard);
router.get("/parent", authorize("PARENT"), ctrl.parentDashboard);

export default router;
