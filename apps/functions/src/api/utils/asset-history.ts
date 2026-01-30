export type AssetHistoryEntryInput = {
  type: string;
  title: string;
  detail?: string | null;
  actorUid?: string | null;
  actorEmail?: string | null;
  createdAt?: Date;
  meta?: Record<string, unknown> | null;
};

export const appendAssetHistory = async (assetRef: any, input: AssetHistoryEntryInput) => {
  const historyRef = assetRef.collection("history").doc();
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
