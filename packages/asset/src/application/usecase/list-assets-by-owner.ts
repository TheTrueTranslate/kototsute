import { AssetRepository } from "../port/asset-repository";
import { OwnerId } from "../../domain/value/owner-id";
import { Asset } from "../../domain/entity/asset";

export class ListAssetsByOwner {
  constructor(private readonly repository: AssetRepository) {}

  async execute(ownerId: OwnerId): Promise<Asset[]> {
    return await this.repository.findByOwnerId(ownerId);
  }
}
