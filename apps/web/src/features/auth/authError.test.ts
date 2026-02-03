import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "./authError";

describe("getAuthErrorMessage", () => {
  it("既知のエラーコードをキーに変換する", () => {
    const message = getAuthErrorMessage({ code: "auth/email-already-in-use" });
    expect(message).toBe("authErrors.emailAlreadyInUse");
  });

  it("未知のエラーは汎用キーになる", () => {
    const message = getAuthErrorMessage(new Error("boom"));
    expect(message).toBe("authErrors.default");
  });
});
