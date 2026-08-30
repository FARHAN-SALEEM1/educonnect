import { Router } from "express";

import authRoutes from "./auth.routes.js";
import instituteRoutes from "./institute.routes.js";
import userRoutes from "./user.routes.js";
import studentRoutes from "./student.routes.js";
import teacherRoutes from "./teacher.routes.js";
import parentRoutes from "./parent.routes.js";
import subjectRoutes from "./subject.routes.js";
import assessmentRoutes from "./assessment.routes.js";
import attendanceRoutes from "./attendance.routes.js";
import feeRoutes from "./fee.routes.js";
import timetableRoutes from "./timetable.routes.js";
import classRoutes from "./class.routes.js";
import messageRoutes from "./message.routes.js";
import noticeRoutes from "./notice.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import platformRoutes, { subscriptionRouter } from "./platform.routes.js";
import billingRoutes from "./billing.routes.js";

import { listPlans } from "../controllers/institute.controller.js";
import { updatePlan } from "../controllers/platform.controller.js";
import { updatePlanSchema } from "../validators/platform.schema.js";
import { validate } from "../middleware/validate.js";
import { instituteReport } from "../controllers/dashboard.controller.js";
import { listAuditLogs } from "../controllers/user.controller.js";
import { authenticate, authorize, scopeToInstitute } from "../middleware/auth.js";

const router = Router();

/** Public — the landing page pricing table. */
router.get("/plans", listPlans);
router.patch(
  "/plans/:id",
  authenticate,
  authorize("SUPERADMIN"),
  validate(updatePlanSchema),
  updatePlan
);

router.use("/platform", platformRoutes);
router.use("/subscription-invoices", subscriptionRouter);

router.use("/auth", authRoutes);
// The webhook half of billing is mounted in app.js, above the JSON parser.
router.use("/billing", billingRoutes);
router.use("/institutes", instituteRoutes);
router.use("/users", userRoutes);
router.use("/students", studentRoutes);
router.use("/teachers", teacherRoutes);
router.use("/parents", parentRoutes);
router.use("/subjects", subjectRoutes);
router.use("/assessments", assessmentRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/fees", feeRoutes);
router.use("/timetable", timetableRoutes);
router.use("/classes", classRoutes);
router.use("/messages", messageRoutes);
router.use("/notices", noticeRoutes);
router.use("/dashboard", dashboardRoutes);

router.get(
  "/reports/institute",
  authenticate,
  authorize("SUPERADMIN", "ADMIN"),
  scopeToInstitute,
  instituteReport
);

router.get(
  "/audit-logs",
  authenticate,
  authorize("SUPERADMIN", "ADMIN"),
  scopeToInstitute,
  listAuditLogs
);

/** Machine-readable route index — handy while wiring up the frontend. */
router.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "EduConnect API v1",
    endpoints: {
      auth: "/api/auth",
      plans: "/api/plans",
      institutes: "/api/institutes",
      users: "/api/users",
      students: "/api/students",
      teachers: "/api/teachers",
      parents: "/api/parents",
      subjects: "/api/subjects",
      assessments: "/api/assessments",
      attendance: "/api/attendance",
      fees: "/api/fees",
      timetable: "/api/timetable",
      classes: "/api/classes",
      messages: "/api/messages",
      notices: "/api/notices",
      dashboard: "/api/dashboard",
      reports: "/api/reports/institute",
      auditLogs: "/api/audit-logs",
      platformSettings: "/api/platform/settings",
      subscriptionInvoices: "/api/subscription-invoices",
    },
  });
});

export default router;
