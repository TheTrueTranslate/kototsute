import { describe, expect, it } from "vitest";
import { getReviewModalCopy } from "./ClaimDetailPage";

describe("review modal copy", () => {
  it("returns approve copy", () => {
    const copy = getReviewModalCopy("approve", "");
    expect(copy.title).toBe("運営承認の確認");
    expect(copy.message).toBe("この申請を承認しますか？");
    expect(copy.confirmLabel).toBe("承認する");
    expect(copy.noteLabel).toBeNull();
  });

  it("returns reject copy with note", () => {
    const copy = getReviewModalCopy("reject", "不備あり");
    expect(copy.title).toBe("差し戻しの確認");
    expect(copy.message).toBe("この申請を差し戻しますか？");
    expect(copy.confirmLabel).toBe("差し戻す");
    expect(copy.noteLabel).toBe("差し戻し理由: 不備あり");
  });

  it("returns reject copy without note", () => {
    const copy = getReviewModalCopy("reject", "");
    expect(copy.noteLabel).toBe("差し戻し理由: （未入力）");
  });
});
