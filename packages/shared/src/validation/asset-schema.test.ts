import { describe, it, expect } from "vitest";
import { assetCreateSchema } from "./asset-schema";

describe("assetCreateSchema", () => {
  it("accepts valid input", () => {
    const result = assetCreateSchema.safeParse({
      label: "自分のウォレット",
      address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing label", () => {
    const result = assetCreateSchema.safeParse({
      address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid address", () => {
    const result = assetCreateSchema.safeParse({
      label: "X",
      address: "invalid"
    });
    expect(result.success).toBe(false);
  });
});
