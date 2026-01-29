import { z } from "zod";

export const planCreateSchema = z.object({
  title: z.string().min(1, "タイトルは必須です")
});

export const planAllocationSchema = z
  .object({
    unitType: z.enum(["PERCENT", "AMOUNT"]),
    allocations: z.array(
      z.object({
        heirUid: z.string().nullable(),
        value: z.number().min(0),
        isUnallocated: z.boolean().optional()
      })
    )
  })
  .superRefine((value, ctx) => {
    const allocations = value.allocations.filter((allocation) => !allocation.isUnallocated);
    if (allocations.some((allocation) => allocation.value < 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allocations"],
        message: "配分は0以上で入力してください"
      });
      return;
    }
    if (value.unitType === "PERCENT") {
      const total = allocations.reduce((sum, allocation) => sum + allocation.value, 0);
      if (total > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allocations"],
          message: "割合の合計は100%以下にしてください"
        });
      }
    }
  });
