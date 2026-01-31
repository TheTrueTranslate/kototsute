export const resolveAssetLockStepIndex = (
  uiStep: number | null | undefined,
  fallback: number
) => {
  if (typeof uiStep !== "number") return fallback;
  if (!Number.isInteger(uiStep) || uiStep < 1 || uiStep > 4) return fallback;
  return uiStep - 1;
};
