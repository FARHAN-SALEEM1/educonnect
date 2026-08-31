import { z } from "zod";

/**
 * A campus belongs to a school, and its code has to be sayable.
 *
 * The code is what a roll number and a filter carry around, so it is kept short
 * and upper-case rather than free text: "GLB", not "Gulberg Campus (new bldg)".
 */
const code = z
  .string()
  .trim()
  .min(2, "A campus code needs at least two characters")
  .max(12, "Keep the campus code short — it appears beside every roll number")
  .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only")
  .transform((s) => s.toUpperCase());

export const createBranchSchema = z.object({
  name: z.string().trim().min(2, "Campus name is required").max(120),
  code,
  city: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  phone: z.string().trim().max(24).optional().nullable(),
  /** The campus a new student lands in when nobody says which. */
  isMain: z.boolean().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

/** Moving people between campuses, which is its own operation. */
export const reassignSchema = z.object({
  studentIds: z.array(z.string()).optional(),
  teacherIds: z.array(z.string()).optional(),
});
