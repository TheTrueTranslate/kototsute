import { describe, it, expect } from "vitest";
import { ListAssetsByOwner } from "./list-assets-by-owner.js";
import { AssetRepository } from "../port/asset-repository.js";
import { Asset } from "../../domain/entity/asset.js";
import { AssetId } from "../../domain/value/asset-id.js";
import { OwnerId } from "../../domain/value/owner-id.js";
import { AssetIdentifier } from "../../domain/value/asset-identifier.js";
import { OccurredAt } from "../../domain/value/occurred-at.js";

class InMemoryRepo implements AssetRepository {
  async generateId() {
    return AssetId.create("asset_1");
  }
  async save() {}
  async findByOwnerId() {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    return [
      Asset.create({
        assetId: AssetId.create("asset_1"),
        ownerId: OwnerId.create("uid_1"),
        type: "CRYPTO_WALLET",
        identifier: AssetIdentifier.create("rXXXX"),
        label: "XRP Wallet",
        linkLevel: "L0",
        status: "MANUAL",
        dataSource: "SELF_DECLARED",
        now
      })
    ];
  }

  async findById() {
    return null;
  }

  async deleteById() {}
}

describe("ListAssetsByOwner", () => {
  it("returns assets for owner", async () => {
    const usecase = new ListAssetsByOwner(new InMemoryRepo());
    const result = await usecase.execute(OwnerId.create("uid_1"));
    expect(result).toHaveLength(1);
    expect(result[0].getLabel()).toBe("XRP Wallet");
  });
});
