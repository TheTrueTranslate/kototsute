const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export const isXrpAddress = (value: string): boolean => {
  if (!value || !value.startsWith("r")) return false;
  if (value.length < 25 || value.length > 35) return false;
  return base58.test(value);
};
