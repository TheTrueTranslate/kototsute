import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "./authError";

describe("getAuthErrorMessage", () => {
  it("既知のエラーコードを日本語メッセージに変換する", () => {
    const message = getAuthErrorMessage({ code: "auth/email-already-in-use" });
    expect(message).toBe("このメールアドレスは既に登録されています");
  });

  it("未知のエラーは汎用メッセージになる", () => {
    const message = getAuthErrorMessage(new Error("boom"));
    expect(message).toBe("認証に失敗しました。もう一度お試しください。");
  });
});
