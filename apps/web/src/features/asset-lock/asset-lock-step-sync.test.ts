import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncAssetLockStep } from "./asset-lock-step-sync";
import { updateAssetLockState } from "../../app/api/asset-lock";

vi.mock("../../app/api/asset-lock", () => ({
  updateAssetLockState: vi.fn()
}));

const updateAssetLockStateMock = vi.mocked(updateAssetLockState);

describe("syncAssetLockStep", () => {
  beforeEach(() => {
    updateAssetLockStateMock.mockClear();
  });

  it("syncs uiStep as stepIndex + 1", async () => {
    await syncAssetLockStep("case-1", 2);
    expect(updateAssetLockStateMock).toHaveBeenCalledWith("case-1", { uiStep: 3 });
  });

  it("skips sync when caseId is missing", async () => {
    await syncAssetLockStep("", 1);
    expect(updateAssetLockStateMock).not.toHaveBeenCalled();
  });
});
