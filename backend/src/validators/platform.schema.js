import { z } from "zod";
import { periodString } from "./common.js";

/** Free-form key/value map; the controller validates each key's own rules. */
export const platformSettingsSchema = z
  .record(z.union([z.string(), z.number()]))
  .refine((obj) => Object.keys(obj).length > 0, { message: "No settings provided" });

export const updatePlanSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  price: z.coerce.number().int().min(0).optional(),
  maxStudents: z.coerce.number().int().min(1).max(1000000).optional(),
  features: z.array(z.string().trim().min(1).max(120)).optional(),
  popular: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const generateSubscriptionsSchema = z.object({
  period: periodString,
});
