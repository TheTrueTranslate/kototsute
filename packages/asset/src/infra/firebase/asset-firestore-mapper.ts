import { Asset } from "../../domain/entity/asset.js";
import { AssetId } from "../../domain/value/asset-id.js";
import { AssetIdentifier } from "../../domain/value/asset-identifier.js";
import { OwnerId } from "../../domain/value/owner-id.js";
import { OccurredAt } from "../../domain/value/occurred-at.js";

const coerceDate = (value: unknown): Date => {
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") {
    const converted = (value as any).toDate();
    if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
      return converted;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const converted = new Date(value);
    if (!Number.isNaN(converted.getTime())) {
      return converted;
    }
  }
  return new Date();
};

export const mapAssetFromFirestore = (data: Record<string, any>, fallbackId: string): Asset => {
  return Asset.reconstruct({
    assetId: AssetId.create(data.assetId ?? fallbackId),
    ownerId: OwnerId.create(data.ownerId),
    type: data.type,
    identifier: AssetIdentifier.create(data.identifier),
    label: data.label,
    linkLevel: data.linkLevel,
    status: data.status,
    dataSource: data.dataSource,
    createdAt: OccurredAt.create(coerceDate(data.createdAt)),
    updatedAt: OccurredAt.create(coerceDate(data.updatedAt))
  });
};
