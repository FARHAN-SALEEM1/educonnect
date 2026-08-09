import { z } from "zod";
import { emailField, optionalDate, phone } from "./common.js";

export const createStudentSchema = z.object({
  name: z.string().trim().min(2, "Student name is required").max(120),
  grade: z.string().trim().min(1, "Grade is required").max(30),
  section: z.string().trim().min(1, "Section is required").max(10),
  rollNo: z.string().trim().min(1, "Roll number is required").max(30),
  dob: optionalDate,
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  bloodGroup: z.string().trim().max(5).optional().nullable(),
  phone: phone.optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  parentId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"]).optional(),
  instituteId: z.string().optional(),
  /** Subject ids to enroll the student into immediately. */
  subjectIds: z.array(z.string()).optional(),
});

export const updateStudentSchema = createStudentSchema.partial();

export const createTeacherSchema = z.object({
  name: z.string().trim().min(2, "Teacher name is required").max(120),
  email: emailField,
  phone: phone.optional().nullable(),
  designation: z.string().trim().max(80).optional().nullable(),
  qualification: z.string().trim().max(120).optional().nullable(),
  isActive: z.boolean().optional(),
  instituteId: z.string().optional(),
  /** When true, also creates a login account for this teacher. */
  createLogin: z.boolean().optional().default(true),
  password: z.string().min(8).max(72).optional(),
  /** Subjects this teacher will own. */
  subjectIds: z.array(z.string()).optional(),
});

export const updateTeacherSchema = createTeacherSchema.partial().omit({ createLogin: true });

export const createParentSchema = z.object({
  name: z.string().trim().min(2, "Parent name is required").max(120),
  email: emailField,
  phone: phone.optional().nullable(),
  relation: z.enum(["Mother", "Father", "Guardian"]).optional(),
  occupation: z.string().trim().max(80).optional().nullable(),
  cnic: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  instituteId: z.string().optional(),
  createLogin: z.boolean().optional().default(true),
  password: z.string().min(8).max(72).optional(),
  /** Link existing students to this parent. */
  studentIds: z.array(z.string()).optional(),
});

export const updateParentSchema = createParentSchema.partial().omit({ createLogin: true });

/** One spreadsheet row. Kept lenient — the controller reports problems per row. */
const importRow = z.object({
  name: z.string().optional(),
  grade: z.string().optional(),
  section: z.string().optional(),
  rollNo: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  guardianName: z.string().optional(),
  guardianEmail: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianRelation: z.string().optional(),
});

export const importStudentsSchema = z.object({
  rows: z.array(importRow).min(1, "The file has no rows").max(2000, "Import at most 2000 rows at a time"),
  /** false (default) = all-or-nothing; true = import the valid rows anyway. */
  partial: z.boolean().optional(),
  createParents: z.boolean().optional(),
  instituteId: z.string().optional(),
});

export const studentQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().trim().optional(),
  grade: z.string().optional(),
  section: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"]).optional(),
  parentId: z.string().optional(),
  instituteId: z.string().optional(),
  sortBy: z.enum(["name", "rollNo", "grade", "createdAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});
