import { describe, it, expect } from "vitest";
import {
  assetCreateSchema,
  assetLabelUpdateSchema,
  assetReserveSchema
} from "./asset-schema";

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
    expect(result.error?.issues[0]?.message).toBe("validation.asset.label.required");
  });

  it("rejects invalid address", () => {
    const result = assetCreateSchema.safeParse({
      label: "X",
      address: "invalid"
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.asset.address.invalid");
  });
});

describe("assetReserveSchema", () => {
  it("rejects negative reserve amounts", () => {
    const result = assetReserveSchema.safeParse({
      reserveXrp: "-1",
      reserveTokens: []
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.asset.numeric");
  });

  it("rejects duplicate tokens", () => {
    const result = assetReserveSchema.safeParse({
      reserveXrp: "0",
      reserveTokens: [
        { currency: "USD", issuer: "rIssuer", reserveAmount: "1" },
        { currency: "USD", issuer: "rIssuer", reserveAmount: "2" }
      ]
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.asset.token.duplicate");
  });

  it("rejects duplicate reserve NFTs", () => {
    const result = assetReserveSchema.safeParse({
      reserveXrp: "0",
      reserveTokens: [],
      reserveNfts: ["nft-1", "nft-1"]
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.asset.nft.duplicate");
  });
});

describe("assetLabelUpdateSchema", () => {
  it("accepts non-empty label", () => {
    const result = assetLabelUpdateSchema.safeParse({ label: "新しい資産名" });
    expect(result.success).toBe(true);
  });

  it("rejects empty label", () => {
    const result = assetLabelUpdateSchema.safeParse({ label: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.asset.label.required");
  });
});
