import type { AssetLockMethod, AssetLockState } from "../../app/api/asset-lock";
import { resolveAssetLockStepIndex } from "./asset-lock-step-utils";

export const shouldStartAssetLock = (
  method: AssetLockMethod,
  lockState: AssetLockState | null
) => {
  if (!lockState) return true;
  if (lockState.method !== method) return true;
  if (!Array.isArray(lockState.items) || lockState.items.length === 0) return true;
  const address = lockState.wallet?.address ?? "";
  if (!address) return true;
  if (!isValidXrplClassicAddress(address)) return true;
  return false;
};

const isValidXrplClassicAddress = (address: string) =>
  /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);

export const resolveStartStepIndex = (
  lockState: AssetLockState | null,
  fallbackIndex: number
) => {
  const index = resolveAssetLockStepIndex(lockState?.uiStep ?? null, fallbackIndex);
  return Math.max(index, 1);
};
