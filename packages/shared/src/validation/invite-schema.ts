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
  email: z.string().email("正しいメールアドレスを入力してください"),
  relationLabel: z.string().min(1, "関係は必須です"),
  relationOther: z.string().optional(),
  memo: z.string().max(400, "メモは400文字以内で入力してください").optional()
});

export const inviteCreateSchema = base.superRefine((values, ctx) => {
  if (values.relationLabel === "その他" && !values.relationOther?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["relationOther"],
      message: "その他の関係を入力してください"
    });
  }
});
