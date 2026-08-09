import { z } from "zod";
import { dateString } from "./common.js";

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

export const createAssessmentSchema = z
  .object({
    studentId: z.string().min(1, "studentId is required"),
    subjectId: z.string().min(1, "subjectId is required"),
    title: z.string().trim().min(1, "Title is required").max(80),
    type: z.enum(["QUIZ", "TEST", "ASSIGNMENT", "PROJECT", "LAB", "EXAM"]).default("QUIZ"),
    obtained: z.coerce.number().min(0),
    total: z.coerce.number().positive("Total marks must be greater than 0"),
    takenOn: dateString.optional(),
    remarks: z.string().trim().max(240).optional().nullable(),
  })
  .refine((d) => d.obtained <= d.total, {
    message: "Obtained marks cannot exceed total marks",
    path: ["obtained"],
  });

/** Record the same assessment for a whole class in one request. */
export const bulkAssessmentSchema = z.object({
  subjectId: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  type: z.enum(["QUIZ", "TEST", "ASSIGNMENT", "PROJECT", "LAB", "EXAM"]).default("QUIZ"),
  total: z.coerce.number().positive(),
  takenOn: dateString.optional(),
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
  takenOn: dateString.optional(),
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
