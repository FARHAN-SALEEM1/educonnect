/**
 * Every EduConnect API call, grouped by resource.
 * Components import from here rather than touching `http` directly.
 */
import { http, tokens } from "./client.js";

export const auth = {
  login: async (email, password) => {
    const data = await http.post("/auth/login", { email, password });
    tokens.set(data);
    return data.user;
  },
  signup: (payload) => http.post("/auth/signup", payload),
  logout: async () => {
    try {
      // The server reads the refresh cookie, revokes it and clears it.
      await http.post("/auth/logout", {});
    } finally {
      tokens.clear();
    }
  },
  me: () => http.get("/auth/me"),
  updateProfile: (payload) => http.patch("/auth/me", payload),
  changePassword: (currentPassword, newPassword) =>
    http.post("/auth/change-password", { currentPassword, newPassword }),
};

export const plans = {
  list: () => http.get("/plans"),
  update: (id, payload) => http.patch(`/plans/${id}`, payload),
};

export const platform = {
  settings: () => http.get("/platform/settings"),
  updateSettings: (payload) => http.patch("/platform/settings", payload),
};

export const subscriptions = {
  list: (params) => http.get("/subscription-invoices", params),
  pay: (id) => http.post(`/subscription-invoices/${id}/pay`),
  generate: (period) => http.post("/subscription-invoices/generate", { period }),
};

export const institutes = {
  list: (params) => http.get("/institutes", params),
  get: (id) => http.get(`/institutes/${id}`),
  create: (payload) => http.post("/institutes", payload),
  update: (id, payload) => http.patch(`/institutes/${id}`, payload),
  changePlan: (id, planId) => http.patch(`/institutes/${id}/plan`, { planId }),

  // Admin self-service — always scoped to the caller's own institute.
  mySubscription: () => http.get("/institutes/me/subscription"),
  changeMyPlan: (planId, studentLimit) =>
    http.post("/institutes/me/subscription/plan", { planId, ...(studentLimit != null && { studentLimit }) }),
  changeMyStudentLimit: (studentLimit) =>
    http.patch("/institutes/me/subscription/limit", { studentLimit }),
  cancelMySubscription: (reason) =>
    http.post("/institutes/me/subscription/cancel", { ...(reason && { reason }) }),
  resumeMySubscription: () => http.post("/institutes/me/subscription/resume", {}),
  changeStatus: (id, status) => http.patch(`/institutes/${id}/status`, { status }),
  remove: (id) => http.delete(`/institutes/${id}`),
};

export const users = {
  list: (params) => http.get("/users", params),
  get: (id) => http.get(`/users/${id}`),
  create: (payload) => http.post("/users", payload),
  update: (id, payload) => http.patch(`/users/${id}`, payload),
  resetPassword: (id, password) => http.post(`/users/${id}/reset-password`, { password }),
  remove: (id) => http.delete(`/users/${id}`),
};

export const students = {
  list: (params) => http.get("/students", params),
  get: (id) => http.get(`/students/${id}`),
  report: (id) => http.get(`/students/${id}/report`),
  create: (payload) => http.post("/students", payload),
  update: (id, payload) => http.patch(`/students/${id}`, payload),
  remove: (id) => http.delete(`/students/${id}`),
  refreshInsights: (id) => http.post(`/students/${id}/insights`),
};

export const teachers = {
  list: (params) => http.get("/teachers", params),
  get: (id) => http.get(`/teachers/${id}`),
  myClasses: () => http.get("/teachers/me/classes"),
  create: (payload) => http.post("/teachers", payload),
  update: (id, payload) => http.patch(`/teachers/${id}`, payload),
  remove: (id) => http.delete(`/teachers/${id}`),
};

export const parents = {
  list: (params) => http.get("/parents", params),
  get: (id) => http.get(`/parents/${id}`),
  myChildren: () => http.get("/parents/me/children"),
  create: (payload) => http.post("/parents", payload),
  update: (id, payload) => http.patch(`/parents/${id}`, payload),
  remove: (id) => http.delete(`/parents/${id}`),
};

export const subjects = {
  list: (params) => http.get("/subjects", params),
  get: (id) => http.get(`/subjects/${id}`),
  create: (payload) => http.post("/subjects", payload),
  update: (id, payload) => http.patch(`/subjects/${id}`, payload),
  remove: (id) => http.delete(`/subjects/${id}`),
  enroll: (payload) => http.post("/subjects/enroll", payload),
  bulkEnroll: (studentIds, subjectIds) =>
    http.post("/subjects/enroll/bulk", { studentIds, subjectIds }),
  updateEnrollment: (id, payload) => http.patch(`/subjects/enrollments/${id}`, payload),
  unenroll: (id) => http.delete(`/subjects/enrollments/${id}`),
};

export const assessments = {
  list: (params) => http.get("/assessments", params),
  gradebook: (params) => http.get("/assessments/gradebook", params),
  create: (payload) => http.post("/assessments", payload),
  bulkCreate: (payload) => http.post("/assessments/bulk", payload),
  update: (id, payload) => http.patch(`/assessments/${id}`, payload),
  remove: (id) => http.delete(`/assessments/${id}`),
};

export const attendance = {
  list: (params) => http.get("/attendance", params),
  register: (grade, section, date) => http.get("/attendance/register", { grade, section, date }),
  summary: (params) => http.get("/attendance/summary", params),
  mark: (payload) => http.post("/attendance", payload),
  markBulk: (date, records) => http.post("/attendance/bulk", { date, records }),
  update: (id, payload) => http.patch(`/attendance/${id}`, payload),
  remove: (id) => http.delete(`/attendance/${id}`),
};

export const fees = {
  list: (params) => http.get("/fees", params),
  get: (id) => http.get(`/fees/${id}`),
  stats: (params) => http.get("/fees/stats", params),
  create: (payload) => http.post("/fees", payload),
  generate: (payload) => http.post("/fees/generate", payload),
  pay: (id, payload) => http.post(`/fees/${id}/pay`, payload),
  update: (id, payload) => http.patch(`/fees/${id}`, payload),
  remove: (id) => http.delete(`/fees/${id}`),
  markOverdue: (lateFee) => http.post("/fees/mark-overdue", { lateFee }),
  remind: (payload) => http.post("/fees/remind", payload ?? {}),
};

export const timetable = {
  get: (params) => http.get("/timetable", params),
  createSlot: (payload) => http.post("/timetable", payload),
  updateSlot: (id, payload) => http.patch(`/timetable/${id}`, payload),
  removeSlot: (id) => http.delete(`/timetable/${id}`),
};

export const messages = {
  list: (params) => http.get("/messages", params),
  get: (id) => http.get(`/messages/${id}`),
  contacts: () => http.get("/messages/contacts"),
  send: (payload) => http.post("/messages", payload),
  reply: (id, body) => http.post(`/messages/${id}/reply`, { body }),
  markRead: (id) => http.patch(`/messages/${id}/read`),
  markAllRead: () => http.patch("/messages/read-all"),
  remove: (id) => http.delete(`/messages/${id}`),
};

export const notices = {
  list: (params) => http.get("/notices", params),
  get: (id) => http.get(`/notices/${id}`),
  create: (payload) => http.post("/notices", payload),
  broadcast: (payload) => http.post("/notices/broadcast", payload),
  update: (id, payload) => http.patch(`/notices/${id}`, payload),
  remove: (id) => http.delete(`/notices/${id}`),
};

export const dashboard = {
  superadmin: () => http.get("/dashboard/superadmin"),
  admin: (params) => http.get("/dashboard/admin", params),
  teacher: () => http.get("/dashboard/teacher"),
  parent: () => http.get("/dashboard/parent"),
};

export const reports = {
  institute: (params) => http.get("/reports/institute", params),
  auditLogs: (params) => http.get("/audit-logs", params),
};

export default {
  auth, plans, platform, subscriptions, institutes, users, students, teachers,
  parents, subjects, assessments, attendance, fees, timetable, messages,
  notices, dashboard, reports,
};
