import { requireNonEmpty } from "@kototsute/shared";

export class AssetId {
  private constructor(private readonly value: string) {}

  static create(value: string): AssetId {
    requireNonEmpty(value, "ASSET_ID_EMPTY", "AssetId is empty");
    return new AssetId(value);
  }

  static reconstruct(value: string): AssetId {
    return AssetId.create(value);
  }

  toString(): string {
    return this.value;
  }
}
