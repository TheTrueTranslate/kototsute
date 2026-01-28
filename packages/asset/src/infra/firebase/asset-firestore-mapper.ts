import { Asset } from "../../domain/entity/asset";
import { AssetId } from "../../domain/value/asset-id";
import { AssetIdentifier } from "../../domain/value/asset-identifier";
import { OwnerId } from "../../domain/value/owner-id";
import { OccurredAt } from "../../domain/value/occurred-at";

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
    createdAt: OccurredAt.create(new Date(data.createdAt)),
    updatedAt: OccurredAt.create(new Date(data.updatedAt))
  });
};
