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

export type RelationOption = (typeof relationOptions)[number];

export const relationOptionKeys: Record<RelationOption, string> = {
  配偶者: "relations.spouse",
  事実婚: "relations.commonLaw",
  長男: "relations.eldestSon",
  長女: "relations.eldestDaughter",
  次男: "relations.secondSon",
  次女: "relations.secondDaughter",
  "子（その他）": "relations.childOther",
  父: "relations.father",
  母: "relations.mother",
  祖父: "relations.grandfather",
  祖母: "relations.grandmother",
  孫: "relations.grandchild",
  兄: "relations.olderBrother",
  姉: "relations.olderSister",
  弟: "relations.youngerBrother",
  妹: "relations.youngerSister",
  義父: "relations.fatherInLaw",
  義母: "relations.motherInLaw",
  義兄: "relations.olderBrotherInLaw",
  義姉: "relations.olderSisterInLaw",
  義弟: "relations.youngerBrotherInLaw",
  義妹: "relations.youngerSisterInLaw",
  甥: "relations.nephew",
  姪: "relations.niece",
  叔父: "relations.uncle",
  叔母: "relations.aunt",
  いとこ: "relations.cousin",
  親族: "relations.relative",
  友人: "relations.friend",
  その他: "relations.other"
};

export const relationOtherValue: RelationOption = relationOptions[relationOptions.length - 1];

export const getRelationOptionKey = (value?: string | null) => {
  if (!value) return null;
  return (relationOptionKeys as Record<string, string>)[value] ?? null;
};

const relationLabelSchema = z
  .string({ required_error: "validation.relation.required" })
  .min(1, "validation.relation.required");

const relationOtherSchema = z.string().optional();

const memoSchema = z
  .string({ required_error: "validation.memo.max" })
  .max(400, "validation.memo.max")
  .optional();

const validateRelationOther = (
  values: { relationLabel: string; relationOther?: string },
  ctx: z.RefinementCtx
) => {
  if (values.relationLabel === relationOtherValue && !values.relationOther?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["relationOther"],
      message: "validation.relationOther.required"
    });
  }
};

export const inviteCreateSchema = z
  .object({
    email: z
      .string({ required_error: "validation.email.invalid" })
      .email("validation.email.invalid"),
    relationLabel: relationLabelSchema,
    relationOther: relationOtherSchema,
    memo: memoSchema
  })
  .superRefine(validateRelationOther);

export const inviteUpdateSchema = z
  .object({
    relationLabel: relationLabelSchema,
    relationOther: relationOtherSchema,
    memo: memoSchema
  })
  .superRefine(validateRelationOther);
