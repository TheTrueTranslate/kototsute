import { z } from "zod";

export const displayNameSchema = z
  .string({ required_error: "validation.displayName.required" })
  .trim()
  .min(1, "validation.displayName.required")
  .max(50, "validation.displayName.max");

export const caseCreateInputSchema = z.object({});
