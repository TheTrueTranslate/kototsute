import { describe, it, expect } from "vitest";
import { inviteCreateSchema } from "./invite-schema";

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
  });

  it("requires relationOther when relationLabel is その他", () => {
    const result = inviteCreateSchema.safeParse({
      email: "heir@example.com",
      relationLabel: "その他"
    });
    expect(result.success).toBe(false);
  });

  it("rejects memo over 400 chars", () => {
    const result = inviteCreateSchema.safeParse({
      email: "heir@example.com",
      relationLabel: "長男",
      memo: "a".repeat(401)
    });
    expect(result.success).toBe(false);
  });
});
