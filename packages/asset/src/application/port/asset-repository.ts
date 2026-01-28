import { Asset } from "../../domain/entity/asset";
import { AssetId } from "../../domain/value/asset-id";
import { OwnerId } from "../../domain/value/owner-id";

export interface AssetRepository {
  generateId(): Promise<AssetId>;
  save(asset: Asset): Promise<void>;
  findByOwnerId(ownerId: OwnerId): Promise<Asset[]>;
}
