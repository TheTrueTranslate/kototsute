import { Asset } from "../../domain/entity/asset";
import { AssetId } from "../../domain/value/asset-id";

export interface AssetRepository {
  generateId(): Promise<AssetId>;
  save(asset: Asset): Promise<void>;
}
