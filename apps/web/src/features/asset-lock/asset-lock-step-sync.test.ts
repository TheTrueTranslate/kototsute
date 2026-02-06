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

  it("syncs merged stepIndex to uiStep", async () => {
    await syncAssetLockStep("case-1", 0);
    expect(updateAssetLockStateMock).toHaveBeenCalledWith("case-1", { uiStep: 1 });

    await syncAssetLockStep("case-1", 1);
    expect(updateAssetLockStateMock).toHaveBeenCalledWith("case-1", { uiStep: 3 });

    await syncAssetLockStep("case-1", 2);
    expect(updateAssetLockStateMock).toHaveBeenCalledWith("case-1", { uiStep: 4 });
  });

  it("skips sync when caseId is missing", async () => {
    await syncAssetLockStep("", 1);
    expect(updateAssetLockStateMock).not.toHaveBeenCalled();
  });

  it("skips sync when stepIndex is out of range", async () => {
    await syncAssetLockStep("case-1", 3);
    expect(updateAssetLockStateMock).not.toHaveBeenCalled();
  });
});
