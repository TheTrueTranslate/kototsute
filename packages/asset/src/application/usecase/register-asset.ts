import { OccurredAt } from "../../domain/value/occurred-at";
import { Asset } from "../../domain/entity/asset";
import { AssetIdentifier } from "../../domain/value/asset-identifier";
import { AssetStatus } from "../../domain/value/asset-status";
import { AssetType } from "../../domain/value/asset-type";
import { DataSource } from "../../domain/value/data-source";
import { LinkLevel } from "../../domain/value/link-level";
import { OwnerId } from "../../domain/value/owner-id";
import { AssetRepository } from "../port/asset-repository";

export type RegisterAssetInput = {
  ownerId: OwnerId;
  type: AssetType;
  identifier: AssetIdentifier;
  label: string;
  linkLevel: LinkLevel;
  status: AssetStatus;
  dataSource: DataSource;
  now: OccurredAt;
};

export class RegisterAsset {
  constructor(private readonly repository: AssetRepository) {}

  async execute(input: RegisterAssetInput): Promise<Asset> {
    const assetId = await this.repository.generateId();
    const asset = Asset.create({
      assetId,
      ownerId: input.ownerId,
      type: input.type,
      identifier: input.identifier,
      label: input.label,
      linkLevel: input.linkLevel,
      status: input.status,
      dataSource: input.dataSource,
      now: input.now
    });
    await this.repository.save(asset);
    return asset;
  }
}
