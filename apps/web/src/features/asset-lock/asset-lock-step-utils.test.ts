import { describe, it, expect } from "vitest";
import { resolveAssetLockStepIndex } from "./asset-lock-step-utils";

describe("resolveAssetLockStepIndex", () => {
  it("returns fallback when uiStep is null", () => {
    expect(resolveAssetLockStepIndex(null, 0)).toBe(0);
  });

  it("maps uiStep to stepIndex", () => {
    expect(resolveAssetLockStepIndex(1, 0)).toBe(0);
    expect(resolveAssetLockStepIndex(3, 0)).toBe(2);
  });
});
