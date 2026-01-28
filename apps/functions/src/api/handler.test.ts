import { describe, it, expect } from "vitest";
import { createApiHandler } from "./handler";
import { AssetRepository } from "@kototsute/asset";
import { AssetId } from "@kototsute/asset";
import { OwnerId } from "@kototsute/asset";
import { Asset } from "@kototsute/asset";
import { AssetIdentifier } from "@kototsute/asset";
import { OccurredAt } from "@kototsute/asset";

class InMemoryAssetRepository implements AssetRepository {
  private assets: Asset[] = [];

  async generateId(): Promise<AssetId> {
    return AssetId.create(`asset_${this.assets.length + 1}`);
  }

  async save(asset: Asset): Promise<void> {
    this.assets.push(asset);
  }

  async findByOwnerId(ownerId: OwnerId): Promise<Asset[]> {
    return this.assets.filter((asset) => asset.getOwnerId().toString() === ownerId.toString());
  }

  async findById(assetId: AssetId): Promise<Asset | null> {
    return this.assets.find((asset) => asset.getAssetId().toString() === assetId.toString()) ?? null;
  }

  async deleteById(assetId: AssetId): Promise<void> {
    this.assets = this.assets.filter((asset) => asset.getAssetId().toString() !== assetId.toString());
  }
}

type MockReq = {
  method: string;
  path: string;
  body?: any;
};

type MockRes = {
  statusCode: number;
  body: any;
  status: (code: number) => MockRes;
  json: (body: any) => MockRes;
};

const createRes = (): MockRes => {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    }
  };
};

describe("createApiHandler", () => {
  it("returns 400 when label is missing", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = {
      method: "POST",
      path: "/v1/assets",
      body: { address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
    };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body?.ok).toBe(false);
  });

  it("creates asset when input is valid", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = {
      method: "POST",
      path: "/v1/assets",
      body: { label: "自分のウォレット", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
    };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.data?.label).toBe("自分のウォレット");
  });

  it("lists assets for owner", async () => {
    const repo = new InMemoryAssetRepository();
    await repo.save(
      Asset.create({
        assetId: AssetId.create("asset_1"),
        ownerId: OwnerId.create("owner_1"),
        type: "CRYPTO_WALLET",
        identifier: AssetIdentifier.create("rXXXX"),
        label: "XRP Wallet",
        linkLevel: "L0",
        status: "MANUAL",
        dataSource: "SELF_DECLARED",
        now: OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"))
      })
    );

    const handler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = {
      method: "GET",
      path: "/v1/assets"
    };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data).toHaveLength(1);
    expect(res.body?.data?.[0]?.label).toBe("XRP Wallet");
  });
});
