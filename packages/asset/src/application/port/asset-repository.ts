import { Asset } from "../../domain/entity/asset.js";
import { AssetId } from "../../domain/value/asset-id.js";
import { OwnerId } from "../../domain/value/owner-id.js";

export interface AssetRepository {
  generateId(): Promise<AssetId>;
  save(asset: Asset): Promise<void>;
  findByOwnerId(ownerId: OwnerId): Promise<Asset[]>;
  findById(assetId: AssetId): Promise<Asset | null>;
  deleteById(assetId: AssetId): Promise<void>;
}
