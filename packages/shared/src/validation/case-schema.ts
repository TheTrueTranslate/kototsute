import { z } from "zod";

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "表示名を入力してください")
  .max(50, "表示名は50文字以内で入力してください");

export const caseCreateInputSchema = z.object({});
