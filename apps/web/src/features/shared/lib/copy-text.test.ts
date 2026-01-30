import { describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

describe("copyText", () => {
  it("returns empty message when value is missing", async () => {
    const result = await copyText("Memo", "");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("コピーできる値がありません");
  });

  it("copies value and returns success message", async () => {
    const writeText = vi.fn(async () => {});
    const result = await copyText("Memo", "abc", { writeText });
    expect(writeText).toHaveBeenCalledWith("abc");
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Memoをコピーしました");
  });

  it("returns failure message when clipboard throws", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("fail");
    });
    const result = await copyText("Memo", "abc", { writeText });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("コピーに失敗しました");
  });
});
