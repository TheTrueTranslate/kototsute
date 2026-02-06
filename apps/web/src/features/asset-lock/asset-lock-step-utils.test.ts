import { describe, it, expect } from "vitest";
import { resolveAssetLockStepIndex } from "./asset-lock-step-utils";

describe("resolveAssetLockStepIndex", () => {
  it("returns fallback when uiStep is null", () => {
    expect(resolveAssetLockStepIndex(null, 0)).toBe(0);
  });

  it("maps uiStep to merged 3-step index", () => {
    expect(resolveAssetLockStepIndex(1, 0)).toBe(0);
    expect(resolveAssetLockStepIndex(2, 0)).toBe(0);
    expect(resolveAssetLockStepIndex(3, 0)).toBe(1);
    expect(resolveAssetLockStepIndex(4, 0)).toBe(2);
  });
});
