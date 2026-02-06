import { describe, expect, it } from "vitest";
import type { AssetLockState } from "../../app/api/asset-lock";
import { resolveStartStepIndex, shouldStartAssetLock } from "./asset-lock-start";

describe("shouldStartAssetLock", () => {
  const baseLock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: { address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" },
    items: []
  };

  it("returns false when method matches and wallet exists", () => {
    expect(shouldStartAssetLock("B", baseLock)).toBe(false);
  });

  it("returns true when method changes", () => {
    expect(shouldStartAssetLock("A", baseLock)).toBe(true);
  });

  it("returns true when lock state is missing", () => {
    expect(shouldStartAssetLock("B", null)).toBe(true);
  });

  it("returns true when wallet is missing", () => {
    const lockWithoutWallet: AssetLockState = { ...baseLock, wallet: null };
    expect(shouldStartAssetLock("B", lockWithoutWallet)).toBe(true);
  });

  it("returns true when wallet address is invalid", () => {
    const lockWithInvalidWallet: AssetLockState = {
      ...baseLock,
      wallet: { address: "rb50736258607a0e8378887789" }
    };
    expect(shouldStartAssetLock("B", lockWithInvalidWallet)).toBe(true);
  });

  it("forces transfer step index when uiStep is earlier", () => {
    const lockAtMethod: AssetLockState = { ...baseLock, uiStep: 2 };
    expect(resolveStartStepIndex(lockAtMethod, 1)).toBe(1);
  });
});
