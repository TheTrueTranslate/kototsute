import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "メールアドレスを入力してください")
  .email("正しいメールアドレスを入力してください");

const passwordSchema = z
  .string()
  .min(8, "パスワードは8文字以上で入力してください");

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "パスワードが一致しません",
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
