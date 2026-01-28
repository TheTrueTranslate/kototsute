import { describe, it, expect } from "vitest";
import { Asset } from "./asset.js";
import { AssetId } from "../value/asset-id.js";
import { OwnerId } from "../value/owner-id.js";
import { AssetIdentifier } from "../value/asset-identifier.js";
import { OccurredAt } from "../value/occurred-at.js";

describe("Asset.reconstruct", () => {
  it("reconstructs asset with timestamps", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const later = OccurredAt.create(new Date("2024-01-02T00:00:00.000Z"));
    const asset = Asset.reconstruct({
      assetId: AssetId.create("asset_1"),
      ownerId: OwnerId.create("uid_1"),
      type: "CRYPTO_WALLET",
      identifier: AssetIdentifier.create("rXXXX"),
      label: "XRP Wallet",
      linkLevel: "L0",
      status: "MANUAL",
      dataSource: "SELF_DECLARED",
      createdAt: now,
      updatedAt: later
    });

    expect(asset.getCreatedAt().toDate().toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(asset.getUpdatedAt().toDate().toISOString()).toBe("2024-01-02T00:00:00.000Z");
  });
});
