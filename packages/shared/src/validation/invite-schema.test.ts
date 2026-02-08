import { describe, it, expect } from "vitest";
import {
  getRelationOptionKey,
  inviteCreateSchema,
  inviteUpdateSchema
} from "./invite-schema";

describe("inviteCreateSchema", () => {
  it("accepts valid input", () => {
    const result = inviteCreateSchema.safeParse({
      email: "heir@example.com",
      relationLabel: "長男",
      memo: "メモ"
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = inviteCreateSchema.safeParse({
      relationLabel: "長男"
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.email.invalid");
  });

  it("requires relationOther when relationLabel is その他", () => {
    const result = inviteCreateSchema.safeParse({
      email: "heir@example.com",
      relationLabel: "その他"
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.relationOther.required");
  });

  it("rejects memo over 400 chars", () => {
    const result = inviteCreateSchema.safeParse({
      email: "heir@example.com",
      relationLabel: "長男",
      memo: "a".repeat(401)
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.memo.max");
  });
});

describe("inviteUpdateSchema", () => {
  it("accepts valid update input", () => {
    const result = inviteUpdateSchema.safeParse({
      relationLabel: "長女",
      memo: "更新メモ"
    });
    expect(result.success).toBe(true);
  });

  it("requires relationOther when relationLabel is その他", () => {
    const result = inviteUpdateSchema.safeParse({
      relationLabel: "その他"
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("validation.relationOther.required");
  });
});

describe("getRelationOptionKey", () => {
  it("maps stored translation key directly", () => {
    expect(getRelationOptionKey("relations.eldestSon")).toBe("relations.eldestSon");
  });

  it("normalizes relation label with extra spaces", () => {
    expect(getRelationOptionKey(" 長男 ")).toBe("relations.eldestSon");
  });
});
