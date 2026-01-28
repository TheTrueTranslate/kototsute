import { OccurredAt } from "../value/occurred-at";
import { AssetId } from "../value/asset-id";
import { AssetIdentifier } from "../value/asset-identifier";
import { AssetStatus } from "../value/asset-status";
import { AssetType } from "../value/asset-type";
import { DataSource } from "../value/data-source";
import { LinkLevel } from "../value/link-level";
import { OwnerId } from "../value/owner-id";

export type AssetCreateParams = {
  assetId: AssetId;
  ownerId: OwnerId;
  type: AssetType;
  identifier: AssetIdentifier;
  label: string;
  linkLevel: LinkLevel;
  status: AssetStatus;
  dataSource: DataSource;
  now: OccurredAt;
};

export class Asset {
  private constructor(
    private readonly assetId: AssetId,
    private readonly ownerId: OwnerId,
    private readonly type: AssetType,
    private readonly identifier: AssetIdentifier,
    private readonly label: string,
    private readonly linkLevel: LinkLevel,
    private readonly status: AssetStatus,
    private readonly dataSource: DataSource,
    private readonly createdAt: OccurredAt,
    private readonly updatedAt: OccurredAt
  ) {}

  static create(params: AssetCreateParams): Asset {
    return new Asset(
      params.assetId,
      params.ownerId,
      params.type,
      params.identifier,
      params.label,
      params.linkLevel,
      params.status,
      params.dataSource,
      params.now,
      params.now
    );
  }

  getAssetId(): AssetId {
    return this.assetId;
  }

  getOwnerId(): OwnerId {
    return this.ownerId;
  }

  getType(): AssetType {
    return this.type;
  }

  getIdentifier(): AssetIdentifier {
    return this.identifier;
  }

  getLabel(): string {
    return this.label;
  }

  getLinkLevel(): LinkLevel {
    return this.linkLevel;
  }

  getStatus(): AssetStatus {
    return this.status;
  }

  getDataSource(): DataSource {
    return this.dataSource;
  }

  getCreatedAt(): OccurredAt {
    return this.createdAt;
  }

  getUpdatedAt(): OccurredAt {
    return this.updatedAt;
  }
}
