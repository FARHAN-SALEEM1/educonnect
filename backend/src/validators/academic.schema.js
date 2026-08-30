import { z } from "zod";
import { notFutureDate } from "./common.js";

export const createSubjectSchema = z.object({
  name: z.string().trim().min(2, "Subject name is required").max(80),
  code: z.string().trim().max(20).optional().nullable(),
  grade: z.string().trim().max(30).optional().nullable(),
  color: z.string().trim().max(24).optional().nullable(),
  teacherId: z.string().optional().nullable(),
  instituteId: z.string().optional(),
});

export const updateSubjectSchema = createSubjectSchema.partial();

export const enrollSchema = z.object({
  studentId: z.string().min(1),
  subjectId: z.string().min(1),
  currentScore: z.coerce.number().min(0).max(100).optional().nullable(),
  previousScore: z.coerce.number().min(0).max(100).optional().nullable(),
});

export const bulkEnrollSchema = z.object({
  studentIds: z.array(z.string()).min(1, "Select at least one student"),
  subjectIds: z.array(z.string()).min(1, "Select at least one subject"),
});

export const updateEnrollmentSchema = z.object({
  currentScore: z.coerce.number().min(0).max(100).optional().nullable(),
  previousScore: z.coerce.number().min(0).max(100).optional().nullable(),
});

/**
 * A term is named by the school, not chosen from a fixed list.
 *
 * This was `["FIRST","MID","FINAL"]` — three terms with those names for every
 * school on the platform. The names now live in `ExamTerm` rows belonging to a
 * session, and the API takes the name; the controller resolves it inside that
 * year and refuses one the school has not set up.
 */
const termName = z.string().trim().min(1).max(60);

export const createAssessmentSchema = z
  .object({
    studentId: z.string().min(1, "studentId is required"),
    subjectId: z.string().min(1, "subjectId is required"),
    /** Which academic year the mark belongs to. Defaults to the one the school is running. */
    session: z.string().trim().optional(),
    title: z.string().trim().min(1, "Title is required").max(80),
    type: z.enum(["QUIZ", "TEST", "ASSIGNMENT", "PROJECT", "LAB", "EXAM"]).default("QUIZ"),
    term: termName.optional().nullable(),
    obtained: z.coerce.number().min(0),
    total: z.coerce.number().positive("Total marks must be greater than 0"),
    takenOn: notFutureDate("Assessment date").optional(),
    remarks: z.string().trim().max(240).optional().nullable(),
  })
  .refine((d) => d.obtained <= d.total, {
    message: "Obtained marks cannot exceed total marks",
    path: ["obtained"],
  });

/** Record the same assessment for a whole class in one request. */
export const bulkAssessmentSchema = z.object({
  subjectId: z.string().min(1),
  /** Which academic year these marks belong to. Defaults to the current one. */
  session: z.string().trim().optional(),
  title: z.string().trim().min(1).max(80),
  type: z.enum(["QUIZ", "TEST", "ASSIGNMENT", "PROJECT", "LAB", "EXAM"]).default("QUIZ"),
  term: termName.optional().nullable(),
  total: z.coerce.number().positive(),
  takenOn: notFutureDate("Assessment date").optional(),
  results: z
    .array(
      z.object({
        studentId: z.string().min(1),
        obtained: z.coerce.number().min(0),
        remarks: z.string().trim().max(240).optional().nullable(),
      })
    )
    .min(1, "Add at least one student result"),
});

export const updateAssessmentSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  type: z.enum(["QUIZ", "TEST", "ASSIGNMENT", "PROJECT", "LAB", "EXAM"]).optional(),
  obtained: z.coerce.number().min(0).optional(),
  total: z.coerce.number().positive().optional(),
  takenOn: notFutureDate("Assessment date").optional(),
  remarks: z.string().trim().max(240).optional().nullable(),
});

export const timetableSlotSchema = z.object({
  grade: z.string().trim().min(1).max(30),
  section: z.string().trim().min(1).max(10),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  period: z.coerce.number().int().min(1).max(12),
  subjectId: z.string().min(1),
  teacherId: z.string().optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  room: z.string().trim().max(30).optional().nullable(),
  instituteId: z.string().optional(),
});

export const updateTimetableSlotSchema = timetableSlotSchema.partial();

/**
 * "08:00" → 480. Comparing minutes rather than strings means 09:00 vs 10:00
 * orders correctly, which lexical comparison happens to get right for
 * zero-padded 24h times but stops doing the moment anyone writes "9:00".
 */
export const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
};

const timeField = z
  .string()
  .trim()
  .regex(/^\d{1,2}:\d{2}$/, "Use 24-hour HH:MM, e.g. 08:00")
  .refine((v) => minutesOf(v) !== null, "That is not a real time");

/**
 * Academic year as the school writes it: "2026-27" or "2026-2027". Not derived
 * from the clock, because a school's year does not start on 1 January and only
 * the school knows which year a class belongs to.
 */
const academicYear = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}(\d{2})?$/, "Use a school year like 2026-27");

export const createClassSchema = z.object({
  name: z.string().trim().min(1, "Class or grade name is required").max(40),
  section: z.string().trim().min(1, "Section is required").max(20),
  code: z.string().trim().min(1, "Class code is required").max(30),
  academicYear,
  room: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
  classTeacherId: z.string().optional().nullable(),
  isArchived: z.boolean().optional(),
});

export const updateClassSchema = createClassSchema.partial();

/** Moving students into a class. */
export const assignStudentsSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, "Select at least one student"),
});

/**
 * A timetable slot with a real time range.
 *
 * `startTime`/`endTime` are required here, unlike the older period-only schema,
 * because conflict detection compares ranges. Rows created before this existed
 * keep their nullable times and are handled as period-only — see
 * `conflictsFor` in the controller.
 */
export const scheduleSlotSchema = z
  .object({
    classId: z.string().min(1, "Choose a class"),
    subjectId: z.string().min(1, "Choose a subject"),
    teacherId: z.string().min(1).optional().nullable(),
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    period: z.coerce.number().int().min(1).max(12).optional(),
    startTime: timeField,
    endTime: timeField,
    room: z.string().trim().max(40).optional().nullable(),
    academicYear: academicYear.optional(),
    notes: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => minutesOf(v.endTime) > minutesOf(v.startTime), {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export const updateScheduleSlotSchema = z
  .object({
    classId: z.string().min(1).optional(),
    subjectId: z.string().min(1).optional(),
    teacherId: z.string().min(1).optional().nullable(),
    dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
    period: z.coerce.number().int().min(1).max(12).optional(),
    startTime: timeField.optional(),
    endTime: timeField.optional(),
    room: z.string().trim().max(40).optional().nullable(),
    academicYear: academicYear.optional(),
    notes: z.string().trim().max(300).optional().nullable(),
  })
  .refine(
    (v) =>
      v.startTime === undefined ||
      v.endTime === undefined ||
      minutesOf(v.endTime) > minutesOf(v.startTime),
    { message: "End time must be after start time", path: ["endTime"] }
  );
