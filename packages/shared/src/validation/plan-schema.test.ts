import { describe, it, expect } from "vitest";
import { planCreateSchema, planAllocationSchema } from "./plan-schema";

describe("plan schemas", () => {
  it("rejects empty title", () => {
    const result = planCreateSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts percent allocations with null heir (unallocated)", () => {
    const result = planAllocationSchema.safeParse({
      unitType: "PERCENT",
      allocations: [{ heirUid: null, value: 10, isUnallocated: true }]
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative allocation values", () => {
    const result = planAllocationSchema.safeParse({
      unitType: "AMOUNT",
      allocations: [{ heirUid: "heir_1", value: -1 }]
    });
    expect(result.success).toBe(false);
  });

  it("rejects percent allocations over 100", () => {
    const result = planAllocationSchema.safeParse({
      unitType: "PERCENT",
      allocations: [
        { heirUid: "heir_1", value: 60 },
        { heirUid: "heir_2", value: 50 }
      ]
    });
    expect(result.success).toBe(false);
  });
});
