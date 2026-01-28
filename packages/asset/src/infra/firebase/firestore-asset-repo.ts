import { Asset } from "../../domain/entity/asset";
import { AssetId } from "../../domain/value/asset-id";
import { AssetRepository } from "../../application/port/asset-repository";
import { getFirestore } from "firebase-admin/firestore";

export class FirestoreAssetRepository implements AssetRepository {
  async generateId(): Promise<AssetId> {
    const doc = getFirestore().collection("assets").doc();
    return AssetId.create(doc.id);
  }

  async save(asset: Asset): Promise<void> {
    const db = getFirestore();
    await db.collection("assets").doc(asset.getAssetId().toString()).set({
      assetId: asset.getAssetId().toString(),
      ownerId: asset.getOwnerId().toString(),
      type: asset.getType(),
      identifier: asset.getIdentifier().toString(),
      label: asset.getLabel(),
      linkLevel: asset.getLinkLevel(),
      status: asset.getStatus(),
      dataSource: asset.getDataSource(),
      createdAt: asset.getCreatedAt().toDate(),
      updatedAt: asset.getUpdatedAt().toDate()
    });
  }
}
