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

  /**
   * Ask for a reset link. Resolves the same way whether or not the address is
   * registered — the API deliberately answers 200 either way so nobody can use
   * this to discover who has an account, and the caller must not draw any
   * distinction the API refused to make.
   */
  forgotPassword: (email) => http.post("/auth/forgot-password", { email }),

  /**
   * Redeem a reset link. The token comes from the emailed URL; the API checks
   * it is unexpired, unused and matches a stored hash, then revokes every
   * existing session for that account.
   */
  resetPassword: (token, password) => http.post("/auth/reset-password", { token, password }),

  updateProfile: (payload) => http.patch("/auth/me", payload),
  /**
   * Changing the password revokes every session and issues this device a new
   * one — so the returned token has to replace the one in memory, or the next
   * request would go out with a token whose refresh cookie no longer exists.
   */
  changePassword: async (currentPassword, newPassword) => {
    const data = await http.post("/auth/change-password", { currentPassword, newPassword });
    tokens.set(data);
    return data;
  },
};

export const plans = {
  list: () => http.get("/plans"),
  update: (id, payload) => http.patch(`/plans/${id}`, payload),
};

/**
 * Billing.
 *
 * Nothing here carries a provider secret or customer reference — checkout
 * returns a URL on the gateway's own domain and that is all the browser ever
 * sees. Payment is confirmed by a signed webhook to the server; the page the
 * browser lands on afterwards proves nothing and grants nothing.
 */
export const billing = {
  status: () => http.get("/billing/status"),
  checkout: (planId) => http.post("/billing/checkout-session", { planId }),
  cancel: () => http.post("/billing/cancel", {}),
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

  notificationSettings: () => http.get("/institutes/me/notifications"),
  /** The academic session the school is running, and what each class holds. */
  session: () => http.get("/institutes/me/session"),
  /** Moving the school into a session. Dates are optional — April to March by default. */
  setSession: (currentSession, dates) =>
    http.patch("/institutes/me/session", { currentSession, ...(dates ?? {}) }),
  /** Correcting one session's dates, without changing which one is current. */
  setSessionDates: (id, startsOn, endsOn) =>
    http.patch(`/institutes/me/sessions/${id}`, { startsOn, endsOn }),
  /** The examination terms of one year — the school's own names for them. */
  terms: (sessionId) => http.get(`/institutes/me/sessions/${sessionId}/terms`),
  addTerm: (sessionId, payload) =>
    http.post(`/institutes/me/sessions/${sessionId}/terms`, payload),
  updateTerm: (sessionId, termId, payload) =>
    http.patch(`/institutes/me/sessions/${sessionId}/terms/${termId}`, payload),
  removeTerm: (sessionId, termId) =>
    http.delete(`/institutes/me/sessions/${sessionId}/terms/${termId}`),
  /** The whole year, in the order it should run. Every term has to be listed. */
  reorderTerms: (sessionId, order) =>
    http.patch(`/institutes/me/sessions/${sessionId}/terms/order`, { order }),
  /**
   * The school's grading policy — its bands and its pass mark.
   *
   * 33% is the pass mark across most Pakistani boards and 40% in a good many
   * private schools, and no two schools agree on where A+ starts. The reply
   * carries `isDefault` and `defaults`, so a screen can say plainly whether
   * the school has chosen anything yet and offer to put it back.
   */
  grading: () => http.get("/institutes/me/grading"),
  updateGrading: (patch) => http.patch("/institutes/me/grading", patch),
  updateNotificationSettings: (patch) => http.patch("/institutes/me/notifications", patch),
  changeStatus: (id, status) => http.patch(`/institutes/${id}/status`, { status }),
  remove: (id) => http.delete(`/institutes/${id}`),

  /**
   * The institute recycle bin. `remove` above is a soft delete — the row, its
   * people and their records all stay; only `purge` destroys anything.
   */
  deleted: () => http.get("/institutes/deleted"),
  restore: (id) => http.post(`/institutes/${id}/restore`),
  purge: (id) => http.delete(`/institutes/${id}/purge`),
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
  /** The result card. `term` narrows it to one reporting period. */
  /**
   * One academic year's card. Omit `session` for the year the school is
   * running; name one to reach a year the student has already finished.
   */
  report: (id, { term, session } = {}) =>
    http.get(`/students/${id}/report`, {
      ...(term && { term }),
      ...(session && { session }),
    }),
  create: (payload) => http.post("/students", payload),
  /** Bulk CSV import. `partial` imports the good rows and reports the rest. */
  import: (payload) => http.post("/students/import", payload),
  /** The end-of-session move. Send dryRun to see it without doing it. */
  promote: (payload) => http.post("/students/promote", payload),
  promotions: (id) => http.get(`/students/${id}/promotions`),
  update: (id, payload) => http.patch(`/students/${id}`, payload),
  remove: (id) => http.delete(`/students/${id}`),
  refreshInsights: (id) => http.post(`/students/${id}/insights`),
  /** The recycle bin. Deletes are soft, so a removed record can come back. */
  deleted: (params) => http.get("/students/deleted", params),
  restore: (id) => http.post(`/students/${id}/restore`),
  purge: (id) => http.delete(`/students/${id}/purge`),
};

export const teachers = {
  list: (params) => http.get("/teachers", params),
  get: (id) => http.get(`/teachers/${id}`),
  myClasses: () => http.get("/teachers/me/classes"),
  create: (payload) => http.post("/teachers", payload),
  update: (id, payload) => http.patch(`/teachers/${id}`, payload),
  remove: (id) => http.delete(`/teachers/${id}`),
  deleted: (params) => http.get("/teachers/deleted", params),
  restore: (id) => http.post(`/teachers/${id}/restore`),
  purge: (id) => http.delete(`/teachers/${id}/purge`),
};

export const parents = {
  list: (params) => http.get("/parents", params),
  get: (id) => http.get(`/parents/${id}`),
  myChildren: () => http.get("/parents/me/children"),
  create: (payload) => http.post("/parents", payload),
  update: (id, payload) => http.patch(`/parents/${id}`, payload),
  remove: (id) => http.delete(`/parents/${id}`),
  deleted: (params) => http.get("/parents/deleted", params),
  restore: (id) => http.post(`/parents/${id}/restore`),
  purge: (id) => http.delete(`/parents/${id}/purge`),
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
  /** Rebuilds every enrolment's score in this subject from its own marks. */
  recalculate: (id) => http.post(`/subjects/${id}/recalculate`, {}),
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

  /**
   * Admin scheduling. Separate from the calls above because these take a class
   * id and a real time range and run the conflict checks; the originals take a
   * loose grade/section pair and stay for anything already using them.
   *
   * `schedule` returns the raw list plus `meta.rooms`, so the room filter can
   * be built without a second request.
   */
  schedule: (params) => http.get("/timetable/schedule", params),
  addSlot: (payload) => http.post("/timetable/schedule", payload),
  editSlot: (id, payload) => http.patch(`/timetable/schedule/${id}`, payload),
};

export const classes = {
  list: (params) => http.get("/classes", params),
  get: (id) => http.get(`/classes/${id}`),
  create: (payload) => http.post("/classes", payload),
  update: (id, payload) => http.patch(`/classes/${id}`, payload),
  // Archive rather than delete — the API has no destructive class route.
  archive: (id, isArchived = true) => http.patch(`/classes/${id}/archive`, { isArchived }),
  assignStudents: (id, studentIds) => http.post(`/classes/${id}/students`, { studentIds }),
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

/** Campuses of one school. Empty for the schools that only have one. */
export const branches = {
  list: () => http.get("/branches"),
  create: (payload) => http.post("/branches", payload),
  update: (id, payload) => http.patch(`/branches/${id}`, payload),
  remove: (id) => http.delete(`/branches/${id}`),
  reassign: (id, payload) => http.post(`/branches/${id}/reassign`, payload),
};

export const reports = {
  institute: (params) => http.get("/reports/institute", params),
  auditLogs: (params) => http.get("/audit-logs", params),
};

export default {
  auth, plans, platform, subscriptions, billing, institutes, users, students,
  teachers, parents, subjects, assessments, attendance, fees, timetable, classes,
  messages, notices, dashboard, reports, branches,
};
