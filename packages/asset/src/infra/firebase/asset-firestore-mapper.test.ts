import { describe, it, expect } from "vitest";
import { mapAssetFromFirestore } from "./asset-firestore-mapper";

describe("mapAssetFromFirestore", () => {
  it("maps firestore data to Asset", () => {
    const asset = mapAssetFromFirestore(
      {
        assetId: "asset_1",
        ownerId: "uid_1",
        type: "CRYPTO_WALLET",
        identifier: "rXXXX",
        label: "XRP Wallet",
        linkLevel: "L0",
        status: "MANUAL",
        dataSource: "SELF_DECLARED",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z")
      },
      "asset_1"
    );

    expect(asset.getLabel()).toBe("XRP Wallet");
    expect(asset.getCreatedAt().toDate().toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });
});
