import { DomainError } from "@kototsute/shared";

export class AssetIdentifier {
  private constructor(private readonly value: string) {}

  static create(value: string): AssetIdentifier {
    if (!value || value.trim().length === 0) {
      throw new DomainError("ASSET_IDENTIFIER_EMPTY", "AssetIdentifier is empty");
    }
    return new AssetIdentifier(value);
  }

  static reconstruct(value: string): AssetIdentifier {
    return AssetIdentifier.create(value);
  }

  toString(): string {
    return this.value;
  }
}
