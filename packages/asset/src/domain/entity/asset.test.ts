import { describe, it, expect } from "vitest";
import { Asset } from "./asset";
import { AssetId } from "../value/asset-id";
import { OwnerId } from "../value/owner-id";
import { AssetIdentifier } from "../value/asset-identifier";
import { OccurredAt } from "../value/occurred-at";

const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));

describe("Asset", () => {
  it("creates asset with defaults", () => {
    const asset = Asset.create({
      assetId: AssetId.create("asset_1"),
      ownerId: OwnerId.create("uid_1"),
      type: "BANK_ACCOUNT",
      identifier: AssetIdentifier.create("bank_123"),
      label: "Main Bank",
      linkLevel: "L0",
      status: "MANUAL",
      dataSource: "SELF_DECLARED",
      now
    });

    expect(asset.getOwnerId().toString()).toBe("uid_1");
    expect(asset.getType()).toBe("BANK_ACCOUNT");
    expect(asset.getStatus()).toBe("MANUAL");
  });
});
