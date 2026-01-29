export type PlanHistoryEntryInput = {
  type: string;
  title: string;
  detail?: string | null;
  actorUid?: string | null;
  actorEmail?: string | null;
  createdAt?: Date;
  meta?: Record<string, unknown> | null;
};

export const formatPlanToken = (token: any): string | null => {
  if (!token || typeof token !== "object") return null;
  const currency = typeof token.currency === "string" ? token.currency : "";
  if (!currency) return null;
  const isNative = Boolean(token.isNative);
  if (isNative) return currency;
  const issuer = typeof token.issuer === "string" ? token.issuer : "";
  return issuer ? `${currency} (${issuer})` : currency;
};

export const normalizePlanAllocations = (
  unitType: "PERCENT" | "AMOUNT",
  allocations: Array<{ heirUid: string | null; value: number; isUnallocated?: boolean }>
) => {
  const cleaned = allocations
    .filter((allocation) => !allocation.isUnallocated)
    .map((allocation) => ({
      heirUid: allocation.heirUid,
      value: allocation.value,
      isUnallocated: false
    }));
  if (unitType !== "PERCENT") return cleaned;
  const sum = cleaned.reduce((total, allocation) => total + allocation.value, 0);
  if (sum < 100) {
    return [...cleaned, { heirUid: null, value: Number((100 - sum).toFixed(6)), isUnallocated: true }];
  }
  return cleaned;
};

export const appendPlanHistory = async (planRef: any, input: PlanHistoryEntryInput) => {
  const historyRef = planRef.collection("history").doc();
  await historyRef.set({
    historyId: historyRef.id,
    type: input.type,
    title: input.title,
    detail: input.detail ?? null,
    actorUid: input.actorUid ?? null,
    actorEmail: input.actorEmail ?? null,
    createdAt: input.createdAt ?? new Date(),
    meta: input.meta ?? null
  });
};
