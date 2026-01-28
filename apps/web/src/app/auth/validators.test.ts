import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, resetSchema } from "./validators";

describe("registerSchema", () => {
  it("パスワード不一致を弾く", () => {
    const result = registerSchema.safeParse({
      email: "a@example.com",
      password: "password123",
      confirmPassword: "different123"
    });
    expect(result.success).toBe(false);
  });

  it("正しい入力を通す", () => {
    const result = registerSchema.safeParse({
      email: "a@example.com",
      password: "password123",
      confirmPassword: "password123"
    });
    expect(result.success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("短いパスワードを弾く", () => {
    const result = loginSchema.safeParse({
      email: "a@example.com",
      password: "short"
    });
    expect(result.success).toBe(false);
  });
});

describe("resetSchema", () => {
  it("メール未入力を弾く", () => {
    const result = resetSchema.safeParse({
      email: ""
    });
    expect(result.success).toBe(false);
  });
});
