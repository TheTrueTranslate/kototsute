import { AssetRepository } from "../port/asset-repository.js";
import { OwnerId } from "../../domain/value/owner-id.js";
import { Asset } from "../../domain/entity/asset.js";

export class ListAssetsByOwner {
  constructor(private readonly repository: AssetRepository) {}

  async execute(ownerId: OwnerId): Promise<Asset[]> {
    return await this.repository.findByOwnerId(ownerId);
  }
}
