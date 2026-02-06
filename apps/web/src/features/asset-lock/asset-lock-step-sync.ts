import { updateAssetLockState } from "../../app/api/asset-lock";

export const syncAssetLockStep = async (caseId: string | undefined, stepIndex: number) => {
  if (!caseId) return null;
  const uiStepByIndex: Record<number, number> = {
    0: 1,
    1: 3,
    2: 4
  };
  if (!Number.isInteger(stepIndex) || !(stepIndex in uiStepByIndex)) return null;
  const uiStep = uiStepByIndex[stepIndex];
  return updateAssetLockState(caseId, { uiStep });
};
