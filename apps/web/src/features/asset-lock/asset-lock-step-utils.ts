export const resolveAssetLockStepIndex = (
  uiStep: number | null | undefined,
  fallback: number
) => {
  if (typeof uiStep !== "number") return fallback;
  if (!Number.isInteger(uiStep) || uiStep < 1 || uiStep > 4) return fallback;
  if (uiStep <= 2) return 0;
  if (uiStep === 3) return 1;
  return 2;
};
