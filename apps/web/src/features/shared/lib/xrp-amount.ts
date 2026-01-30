export const normalizeNumberInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [head, ...rest] = cleaned.split(".");
  return rest.length ? `${head}.${rest.join("")}` : head;
};

export const formatXrp = (value: number) => {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(6).replace(/\.?0+$/, "");
};

export const dropsToXrpInput = (drops: string) => {
  const cleaned = normalizeNumberInput(drops);
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return "";
  return formatXrp(numeric / 1_000_000);
};

export const xrpToDropsInput = (xrp: string) => {
  const cleaned = normalizeNumberInput(xrp);
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return "";
  return String(Math.round(numeric * 1_000_000));
};
