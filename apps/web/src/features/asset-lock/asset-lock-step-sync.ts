import { updateAssetLockState } from "../../app/api/asset-lock";

export const syncAssetLockStep = async (caseId: string | undefined, stepIndex: number) => {
  if (!caseId) return null;
  const uiStep = stepIndex + 1;
  if (!Number.isInteger(uiStep) || uiStep < 1 || uiStep > 4) return null;
  return updateAssetLockState(caseId, { uiStep });
};
