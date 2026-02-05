import { z } from "zod";

export const planCreateSchema = z.object({
  title: z
    .string({ required_error: "validation.plan.title.required" })
    .min(1, "validation.plan.title.required")
});

export const planAllocationSchema = z
  .object({
    unitType: z.enum(["PERCENT", "AMOUNT"]),
    allocations: z.array(
      z.object({
        heirUid: z.string().nullable(),
        value: z.number().min(0, "validation.plan.allocation.min"),
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
        message: "validation.plan.allocation.min"
      });
      return;
    }
    if (value.unitType === "PERCENT") {
      const total = allocations.reduce((sum, allocation) => sum + allocation.value, 0);
      if (total > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allocations"],
          message: "validation.plan.allocation.percentMax"
        });
      }
    }
  });

export const planNftAllocationSchema = z
  .object({
    allocations: z.array(
      z.object({
        tokenId: z
          .string({ required_error: "validation.plan.nft.required" })
          .min(1, "validation.plan.nft.required"),
        heirUid: z.string().nullable()
      })
    )
  })
  .superRefine((value, ctx) => {
    const ids = value.allocations.map((item) => item.tokenId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allocations"],
        message: "validation.plan.nft.duplicate"
      });
    }
  });
