import { describe, expect, it } from "vitest";
import { toClaimStatusLabel, canPrepareApprovalTx } from "./ClaimDetailPage";

describe("claim status label", () => {
  it("maps status to Japanese label", () => {
    expect(toClaimStatusLabel("SUBMITTED")).toBe("運営確認待ち");
    expect(toClaimStatusLabel("ADMIN_APPROVED")).toBe("運営承認済み");
    expect(toClaimStatusLabel("ADMIN_REJECTED")).toBe("差し戻し");
    expect(toClaimStatusLabel("CONFIRMED")).toBe("死亡確定");
  });

  it("allows approval tx preparation only when confirmed", () => {
    expect(canPrepareApprovalTx("CONFIRMED")).toBe(true);
    expect(canPrepareApprovalTx("SUBMITTED")).toBe(false);
  });
});
