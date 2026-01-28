import { describe, it, expect } from "vitest";
import { RegisterAsset } from "./register-asset";
import { AssetRepository } from "../port/asset-repository";
import { AssetId } from "../../domain/value/asset-id";
import { OwnerId } from "../../domain/value/owner-id";
import { AssetIdentifier } from "../../domain/value/asset-identifier";
import { OccurredAt } from "../../domain/value/occurred-at";

class InMemoryRepo implements AssetRepository {
  public saved: { ownerId: string; type: string; identifier: string; label: string } | null = null;

  async generateId(): Promise<AssetId> {
    return AssetId.create("asset_1");
  }

  async save(asset: any): Promise<void> {
    this.saved = {
      ownerId: asset.getOwnerId().toString(),
      type: asset.getType(),
      identifier: asset.getIdentifier().toString(),
      label: asset.getLabel()
    };
  }

  async findByOwnerId(): Promise<any[]> {
    return [];
  }
}

describe("RegisterAsset", () => {
  it("creates and saves asset", async () => {
    const repo = new InMemoryRepo();
    const usecase = new RegisterAsset(repo);

    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    await usecase.execute({
      ownerId: OwnerId.create("uid_1"),
      type: "BANK_ACCOUNT",
      identifier: AssetIdentifier.create("bank_123"),
      label: "Main Bank",
      linkLevel: "L0",
      status: "MANUAL",
      dataSource: "SELF_DECLARED",
      now
    });

    expect(repo.saved).toEqual({
      ownerId: "uid_1",
      type: "BANK_ACCOUNT",
      identifier: "bank_123",
      label: "Main Bank"
    });
  });
});
