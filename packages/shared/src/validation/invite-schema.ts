import { z } from "zod";

export const relationOptions = [
  "配偶者",
  "事実婚",
  "長男",
  "長女",
  "次男",
  "次女",
  "子（その他）",
  "父",
  "母",
  "祖父",
  "祖母",
  "孫",
  "兄",
  "姉",
  "弟",
  "妹",
  "義父",
  "義母",
  "義兄",
  "義姉",
  "義弟",
  "義妹",
  "甥",
  "姪",
  "叔父",
  "叔母",
  "いとこ",
  "親族",
  "友人",
  "その他"
] as const;

const base = z.object({
  email: z
    .string({ required_error: "validation.email.invalid" })
    .email("validation.email.invalid"),
  relationLabel: z
    .string({ required_error: "validation.relation.required" })
    .min(1, "validation.relation.required"),
  relationOther: z.string().optional(),
  memo: z
    .string({ required_error: "validation.memo.max" })
    .max(400, "validation.memo.max")
    .optional()
});

export const inviteCreateSchema = base.superRefine((values, ctx) => {
  if (values.relationLabel === "その他" && !values.relationOther?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["relationOther"],
      message: "validation.relationOther.required"
    });
  }
});
