import { describe, it, expect } from "vitest";
import { caseCreateInputSchema, displayNameSchema } from "./case-schema";

describe("case schema", () => {
  it("accepts display name and case create input", () => {
    expect(displayNameSchema.safeParse("山田 太郎").success).toBe(true);
    expect(caseCreateInputSchema.safeParse({}).success).toBe(true);
  });

  it("rejects empty display name", () => {
    expect(displayNameSchema.safeParse("").success).toBe(false);
  });
});
