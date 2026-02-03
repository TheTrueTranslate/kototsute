import { z } from "zod";
import { displayNameSchema } from "@kototsute/shared";

const emailSchema = z
  .string()
  .trim()
  .min(1, "validation.email.required")
  .email("validation.email.invalid");

const passwordSchema = z
  .string()
  .min(8, "validation.password.min");

export const registerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "validation.password.mismatch",
    path: ["confirmPassword"]
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

export const resetSchema = z.object({
  email: emailSchema
});

export type RegisterForm = z.infer<typeof registerSchema>;
export type LoginForm = z.infer<typeof loginSchema>;
export type ResetForm = z.infer<typeof resetSchema>;
