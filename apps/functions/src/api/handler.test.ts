import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApiHandler } from "./handler";
import { AssetRepository } from "@kototsute/asset";
import { AssetId } from "@kototsute/asset";
import { OwnerId } from "@kototsute/asset";
import { Asset } from "@kototsute/asset";
import { AssetIdentifier } from "@kototsute/asset";
import { OccurredAt } from "@kototsute/asset";
import { getFirestore } from "firebase-admin/firestore";

const authState = {
  existingEmails: new Set<string>()
};

type StoredDoc = Record<string, any>;
type CollectionStore = Map<string, StoredDoc>;
const store = new Map<string, CollectionStore>();
let docCounter = 1;

const resetStore = () => {
  store.clear();
  docCounter = 1;
};

const getCollectionStore = (name: string) => {
  if (!store.has(name)) {
    store.set(name, new Map());
  }
  return store.get(name)!;
};

class MockDocRef {
  constructor(
    private readonly collectionName: string,
    public readonly id: string
  ) {}

  async set(data: StoredDoc, options?: { merge?: boolean }) {
    const collection = getCollectionStore(this.collectionName);
    if (options?.merge && collection.has(this.id)) {
      const current = collection.get(this.id) ?? {};
      collection.set(this.id, { ...current, ...data });
      return;
    }
    collection.set(this.id, { ...data });
  }

  async get() {
    const collection = getCollectionStore(this.collectionName);
    const data = collection.get(this.id);
    return {
      exists: Boolean(data),
      data: () => data
    };
  }

  async delete() {
    const collection = getCollectionStore(this.collectionName);
    collection.delete(this.id);
  }

  collection(name: string) {
    return new MockCollectionRef(`${this.collectionName}/${this.id}/${name}`);
  }

  get ref() {
    return this;
  }
}

class MockQuery {
  constructor(
    private readonly collectionName: string,
    private readonly filters: Array<{ field: string; value: any }>
  ) {}

  where(field: string, _op: string, value: any) {
    return new MockQuery(this.collectionName, [...this.filters, { field, value }]);
  }

  async get() {
    const collection = getCollectionStore(this.collectionName);
    const docs = Array.from(collection.entries())
      .filter(([_, data]) => this.filters.every((filter) => data[filter.field] === filter.value))
      .map(([id, data]) => ({
        id,
        data: () => data,
        ref: new MockDocRef(this.collectionName, id)
      }));
    return { docs };
  }
}

class MockCollectionRef {
  constructor(private readonly collectionName: string) {}

  doc(id?: string) {
    const resolvedId = id ?? `doc_${docCounter++}`;
    return new MockDocRef(this.collectionName, resolvedId);
  }

  where(field: string, op: string, value: any) {
    return new MockQuery(this.collectionName, [{ field, value }]);
  }

  async get() {
    const collection = getCollectionStore(this.collectionName);
    const docs = Array.from(collection.entries()).map(([id, data]) => ({
      id,
      data: () => data,
      ref: new MockDocRef(this.collectionName, id)
    }));
    return { docs };
  }
}

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: (name: string) => new MockCollectionRef(name)
  })
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    getUserByEmail: async (email: string) => {
      if (!authState.existingEmails.has(email)) {
        const error: any = new Error("not found");
        error.code = "auth/user-not-found";
        throw error;
      }
      return { uid: `uid_${email}` };
    }
  })
}));

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
  query?: any;
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
  beforeEach(() => {
    resetStore();
    authState.existingEmails.clear();
  });

  it("returns 400 when label is missing", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
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
    expect(res.body?.code).toBe("VALIDATION_ERROR");
  });

  it("creates asset when input is valid", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
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
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
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

  it("creates invite when input is valid", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.data?.inviteId).toBeTruthy();

    const snapshot = await getFirestore()
      .collection("invites")
      .where("ownerUid", "==", "owner_1")
      .get();
    expect(snapshot.docs).toHaveLength(1);
    const data = snapshot.docs[0]?.data();
    expect(data?.email).toBe("heir@example.com");
    expect(data?.status).toBe("pending");
  });

  it("lists invites for owner", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    };
    await handler(createReq as any, createRes() as any);

    const listReq: MockReq = {
      method: "GET",
      path: "/v1/invites",
      query: { scope: "owner" }
    };
    const res = createRes();
    await handler(listReq as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data).toHaveLength(1);
    expect(res.body?.data?.[0]?.email).toBe("heir@example.com");
  });

  it("accepts invite and creates heir profile", async () => {
    const repo = new InMemoryAssetRepository();
    const ownerHandler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    };
    const createResBody = createRes();
    await ownerHandler(createReq as any, createResBody as any);
    const inviteId = createResBody.body?.data?.inviteId;

    const heirHandler = createApiHandler({
      repo,
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getUid: async () => "heir_1",
      getAuthUser: async () => ({ uid: "heir_1", email: "heir@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const acceptReq: MockReq = {
      method: "POST",
      path: `/v1/invites/${inviteId}/accept`
    };
    const acceptRes = createRes();
    await heirHandler(acceptReq as any, acceptRes as any);

    expect(acceptRes.statusCode).toBe(200);

    const inviteSnap = await getFirestore().collection("invites").doc(inviteId).get();
    expect(inviteSnap.data()?.status).toBe("accepted");

    const heirSnap = await getFirestore().collection("heirs").doc("heir_1").get();
    expect(heirSnap.exists).toBe(true);
    expect(heirSnap.data()?.ownerUid).toBe("owner_1");
  });

  it("declines invite", async () => {
    const repo = new InMemoryAssetRepository();
    const ownerHandler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    };
    const createResBody = createRes();
    await ownerHandler(createReq as any, createResBody as any);
    const inviteId = createResBody.body?.data?.inviteId;

    const heirHandler = createApiHandler({
      repo,
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getUid: async () => "heir_1",
      getAuthUser: async () => ({ uid: "heir_1", email: "heir@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const declineReq: MockReq = {
      method: "POST",
      path: `/v1/invites/${inviteId}/decline`
    };
    const declineRes = createRes();
    await heirHandler(declineReq as any, declineRes as any);

    expect(declineRes.statusCode).toBe(200);

    const inviteSnap = await getFirestore().collection("invites").doc(inviteId).get();
    expect(inviteSnap.data()?.status).toBe("declined");
  });

  it("deletes pending invite", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    };
    const createResBody = createRes();
    await handler(createReq as any, createResBody as any);
    const inviteId = createResBody.body?.data?.inviteId;

    const deleteReq: MockReq = {
      method: "DELETE",
      path: `/v1/invites/${inviteId}`
    };
    const deleteRes = createRes();
    await handler(deleteReq as any, deleteRes as any);

    expect(deleteRes.statusCode).toBe(200);

    const snapshot = await getFirestore()
      .collection("invites")
      .where("ownerUid", "==", "owner_1")
      .get();
    expect(snapshot.docs).toHaveLength(0);
  });

  it("rejects deleting accepted invite", async () => {
    const repo = new InMemoryAssetRepository();
    const ownerHandler = createApiHandler({
      repo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getUid: async () => "owner_1",
      getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    };
    const createResBody = createRes();
    await ownerHandler(createReq as any, createResBody as any);
    const inviteId = createResBody.body?.data?.inviteId;

    const heirHandler = createApiHandler({
      repo,
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getUid: async () => "heir_1",
      getAuthUser: async () => ({ uid: "heir_1", email: "heir@example.com" }),
      getOwnerUidForRead: async (uid) => uid
    });

    const acceptReq: MockReq = {
      method: "POST",
      path: `/v1/invites/${inviteId}/accept`
    };
    await heirHandler(acceptReq as any, createRes() as any);

    const deleteReq: MockReq = {
      method: "DELETE",
      path: `/v1/invites/${inviteId}`
    };
    const deleteRes = createRes();
    await ownerHandler(deleteReq as any, deleteRes as any);

    expect(deleteRes.statusCode).toBe(400);
    expect(deleteRes.body?.code).toBe("VALIDATION_ERROR");
  });
});
