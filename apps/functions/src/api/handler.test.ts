import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApiHandler } from "./handler";
import { AssetRepository } from "@kototsute/asset";
import { AssetId } from "@kototsute/asset";
import { OwnerId } from "@kototsute/asset";
import { Asset } from "@kototsute/asset";
import { AssetIdentifier } from "@kototsute/asset";
import { OccurredAt } from "@kototsute/asset";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreCaseRepository } from "@kototsute/case";
import { InMemoryCaseRepository } from "./utils/in-memory-case-repo";

const authState = {
  existingEmails: new Set<string>(),
  users: new Map<string, { email?: string | null }>()
};
const authTokens = new Map<string, { uid: string; email?: string | null }>();

type StoredDoc = Record<string, any>;
type CollectionStore = Map<string, StoredDoc>;
const store = new Map<string, CollectionStore>();
let docCounter = 1;

const resetStore = () => {
  store.clear();
  docCounter = 1;
};

const registerAuth = (uid: string, email?: string | null) => {
  const token = `token_${uid}`;
  authTokens.set(token, { uid, email });
  return `Bearer ${token}`;
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

  orderBy(_field: string, _direction?: "asc" | "desc") {
    return this;
  }

  limit(_count: number) {
    return this;
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

  orderBy(field: string, direction?: "asc" | "desc") {
    return new MockQuery(this.collectionName, []).orderBy(field, direction);
  }

  limit(count: number) {
    return new MockQuery(this.collectionName, []).limit(count);
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
    },
    getUser: async (uid: string) => {
      const user = authState.users.get(uid);
      if (!user) {
        const error: any = new Error("not found");
        error.code = "auth/user-not-found";
        throw error;
      }
      return { uid, email: user.email ?? null };
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
  url?: string;
  protocol?: string;
  hostname?: string;
  body?: any;
  query?: any;
  headers?: Record<string, string>;
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

const authedReq = (
  uid: string,
  email: string | null,
  req: Omit<MockReq, "headers">
): MockReq => ({
  ...req,
  url: (() => {
    const params = new URLSearchParams();
    Object.entries(req.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    const qs = params.toString();
    return qs ? `${req.path}?${qs}` : req.path;
  })(),
  protocol: req.protocol ?? "https",
  hostname: req.hostname ?? "example.test",
  headers: { Authorization: registerAuth(uid, email) }
});

describe("createApiHandler", () => {
  beforeEach(() => {
    resetStore();
    authState.existingEmails.clear();
    authState.users.clear();
    authTokens.clear();
  });

  const getAuthUser = async (authHeader: string | null | undefined) => {
    const match = String(authHeader ?? "").match(/^Bearer (.+)$/);
    if (!match) {
      throw new Error("UNAUTHORIZED");
    }
    const auth = authTokens.get(match[1]);
    if (!auth) {
      throw new Error("UNAUTHORIZED");
    }
    return auth;
  };

  it("returns 400 when label is missing", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/assets",
      body: { address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
    });
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
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/assets",
      body: { label: "自分のウォレット", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
    });
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
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "GET",
      path: "/v1/assets"
    });
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data).toHaveLength(1);
    expect(res.body?.data?.[0]?.label).toBe("XRP Wallet");
  });

  it("returns xrpl tokens when includeXrpl is true", async () => {
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

    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === "account_info") {
        return {
          ok: true,
          json: async () => ({ result: { account_data: { Balance: "1000000" }, ledger_index: 1 } })
        } as any;
      }
      if (body.method === "account_lines") {
        return {
          ok: true,
          json: async () => ({
            result: {
              lines: [{ currency: "JPYC", account: "rIssuer", balance: "100" }]
            }
          })
        } as any;
      }
      return { ok: false, json: async () => ({}) } as any;
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "GET",
      path: "/v1/assets/asset_1",
      query: { includeXrpl: "true" }
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.body?.data?.xrpl?.tokens?.[0]?.currency).toBe("JPYC");
  });

  it("creates invite when input is valid", async () => {
    const repo = new InMemoryAssetRepository();
    const handler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const req: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    });
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
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    });
    await handler(createReq as any, createRes() as any);

    const listReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "GET",
      path: "/v1/invites",
      query: { scope: "owner" }
    });
    const res = createRes();
    await handler(listReq as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data).toHaveLength(1);
    expect(res.body?.data?.[0]?.email).toBe("heir@example.com");
  });

  it("creates and lists plans", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/plans",
      body: { title: "2026年版" }
    });
    const resCreate = createRes();
    await handler(createReq as any, resCreate as any);
    expect(resCreate.body?.data?.title).toBe("2026年版");

    const listReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "GET",
      path: "/v1/plans"
    });
    const listRes = createRes();
    await handler(listReq as any, listRes as any);
    expect(listRes.body?.data?.length).toBe(1);
  });

  it("adds heir from accepted invite and shares plan", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    await db.collection("invites").doc("invite_1").set({
      ownerUid: "owner_1",
      status: "accepted",
      acceptedByUid: "heir_1",
      email: "heir@example.com",
      relationLabel: "長男"
    });

    const createReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/plans",
      body: { title: "2026年版" }
    });
    const resCreate = createRes();
    await handler(createReq as any, resCreate as any);
    const planId = resCreate.body?.data?.planId;

    const addReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: `/v1/plans/${planId}/heirs`,
      body: { heirUid: "heir_1" }
    });
    const resAdd = createRes();
    await handler(addReq as any, resAdd as any);

    const shareReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: `/v1/plans/${planId}/share`
    });
    const resShare = createRes();
    await handler(shareReq as any, resShare as any);

    const planSnap = await db.collection("plans").doc(planId).get();
    expect(planSnap.data()?.status).toBe("SHARED");
    expect(planSnap.data()?.heirUids).toContain("heir_1");
  });

  it("updates allocations and auto-adds unallocated for percent", async () => {
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
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const planRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/plans",
        body: { title: "2026年版" }
      }) as any,
      planRes as any
    );
    const planId = planRes.body?.data?.planId;

    const addAssetRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/plans/${planId}/assets`,
        body: { assetId: "asset_1", unitType: "PERCENT" }
      }) as any,
      addAssetRes as any
    );
    const planAssetId = addAssetRes.body?.data?.planAssetId;

    const allocRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/plans/${planId}/assets/${planAssetId}/allocations`,
        body: { unitType: "PERCENT", allocations: [{ heirUid: "heir_1", value: 60 }] }
      }) as any,
      allocRes as any
    );

    const db = getFirestore();
    const snap = await db.collection(`plans/${planId}/assets`).doc(planAssetId).get();
    const allocations = snap.data()?.allocations ?? [];
    expect(allocations.some((a: any) => a.isUnallocated)).toBe(true);
  });

  it("creates notification on invite and can mark read", async () => {
    authState.existingEmails.add("heir@example.com");
    const ownerHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/invites",
        body: { email: "heir@example.com", relationLabel: "長男" }
      }) as any,
      createRes() as any
    );

    const heirHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const listRes = createRes();
    await heirHandler(
      authedReq("uid_heir@example.com", "heir@example.com", {
        method: "GET",
        path: "/v1/notifications"
      }) as any,
      listRes as any
    );
    expect(listRes.body?.data?.length).toBe(1);

    const notificationId = listRes.body?.data?.[0]?.notificationId;
    const readRes = createRes();
    await heirHandler(
      authedReq("uid_heir@example.com", "heir@example.com", {
        method: "POST",
        path: `/v1/notifications/${notificationId}/read`
      }) as any,
      readRes as any
    );

    const listRes2 = createRes();
    await heirHandler(
      authedReq("uid_heir@example.com", "heir@example.com", {
        method: "GET",
        path: "/v1/notifications"
      }) as any,
      listRes2 as any
    );
    expect(listRes2.body?.data?.[0]?.isRead).toBe(true);
  });

  it("includes owner email for received invites", async () => {
    const repo = new InMemoryAssetRepository();
    const ownerHandler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    });
    await ownerHandler(createReq as any, createRes() as any);

    authState.users.set("owner_1", { email: "owner@example.com" });

    const heirHandler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const listReq: MockReq = authedReq("heir_1", "heir@example.com", {
      method: "GET",
      path: "/v1/invites",
      query: { scope: "received" }
    });
    const res = createRes();
    await heirHandler(listReq as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data).toHaveLength(1);
    expect(res.body?.data?.[0]?.ownerEmail).toBe("owner@example.com");
  });

  it("accepts invite and creates heir profile", async () => {
    const repo = new InMemoryAssetRepository();
    const ownerHandler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    });
    const createResBody = createRes();
    await ownerHandler(createReq as any, createResBody as any);
    const inviteId = createResBody.body?.data?.inviteId;

    const heirHandler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const acceptReq: MockReq = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/invites/${inviteId}/accept`
    });
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
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    });
    const createResBody = createRes();
    await ownerHandler(createReq as any, createResBody as any);
    const inviteId = createResBody.body?.data?.inviteId;

    const heirHandler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const declineReq: MockReq = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/invites/${inviteId}/decline`
    });
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
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    });
    const createResBody = createRes();
    await handler(createReq as any, createResBody as any);
    const inviteId = createResBody.body?.data?.inviteId;

    const deleteReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "DELETE",
      path: `/v1/invites/${inviteId}`
    });
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
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: "/v1/invites",
      body: { email: "heir@example.com", relationLabel: "長男" }
    });
    const createResBody = createRes();
    await ownerHandler(createReq as any, createResBody as any);
    const inviteId = createResBody.body?.data?.inviteId;

    const heirHandler = createApiHandler({
      repo,
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const acceptReq: MockReq = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/invites/${inviteId}/accept`
    });
    await heirHandler(acceptReq as any, createRes() as any);

    const deleteReq: MockReq = authedReq("owner_1", "owner@example.com", {
      method: "DELETE",
      path: `/v1/invites/${inviteId}`
    });
    const deleteRes = createRes();
    await ownerHandler(deleteReq as any, deleteRes as any);

    expect(deleteRes.statusCode).toBe(400);
    expect(deleteRes.body?.code).toBe("VALIDATION_ERROR");
  });

  it("creates and lists cases", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createRes() as any
    );

    const listRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: "/v1/cases"
      }) as any,
      listRes as any
    );

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body?.data?.created?.length).toBe(1);
  });

  it("gets case detail", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createResBody = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createResBody as any
    );

    const caseId = createResBody.body?.data?.caseId;
    const detailRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}`
      }) as any,
      detailRes as any
    );

    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.body?.data?.caseId).toBe(caseId);
  });

  it("invites and accepts case member", async () => {
    const caseRepo = new FirestoreCaseRepository();
    const ownerHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createResBody = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createResBody as any
    );
    const caseId = createResBody.body?.data?.caseId;

    const inviteRes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites`,
        body: { email: "heir@example.com", relationLabel: "長男" }
      }) as any,
      inviteRes as any
    );
    const inviteId = inviteRes.body?.data?.inviteId;

    const heirHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    await heirHandler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites/${inviteId}/accept`
      }) as any,
      createRes() as any
    );

    const inviteSnap = await getFirestore()
      .collection(`cases/${caseId}/invites`)
      .doc(inviteId)
      .get();
    expect(inviteSnap.data()?.status).toBe("accepted");

    const caseSnap = await getFirestore().collection("cases").doc(caseId).get();
    expect(caseSnap.data()?.memberUids ?? []).toContain("heir_1");
  });

  it("lists case heirs", async () => {
    const caseRepo = new FirestoreCaseRepository();
    const ownerHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseRes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      caseRes as any
    );
    const caseId = caseRes.body?.data?.caseId;

    const inviteRes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites`,
        body: { email: "heir@example.com", relationLabel: "長男" }
      }) as any,
      inviteRes as any
    );
    const inviteId = inviteRes.body?.data?.inviteId;

    const memberHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    await memberHandler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites/${inviteId}/accept`
      }) as any,
      createRes() as any
    );

    const listRes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/heirs`
      }) as any,
      listRes as any
    );

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body?.data?.length).toBe(1);
    expect(listRes.body?.data?.[0]?.email).toBe("heir@example.com");
  });

  it("lists received case invites", async () => {
    const caseRepo = new FirestoreCaseRepository();
    const ownerHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseRes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      caseRes as any
    );
    const caseId = caseRes.body?.data?.caseId;

    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites`,
        body: { email: "heir@example.com", relationLabel: "長男" }
      }) as any,
      createRes() as any
    );

    const memberHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const listRes = createRes();
    await memberHandler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: "/v1/cases/invites?scope=received"
      }) as any,
      listRes as any
    );

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body?.data?.[0]?.caseId).toBe(caseId);
  });

  it("creates and lists case assets", async () => {
    const caseRepo = new FirestoreCaseRepository();
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createResBody = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createResBody as any
    );
    const caseId = createResBody.body?.data?.caseId;

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );

    const listRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/assets`
      }) as any,
      listRes as any
    );

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body?.data?.length).toBe(1);
    expect(listRes.body?.data?.[0]?.label).toBe("XRP Wallet");
  });

  it("prevents sharing when assets overlap with shared plans", async () => {
    const caseRepo = new FirestoreCaseRepository();
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      caseRes as any
    );
    const caseId = caseRes.body?.data?.caseId;

    const assetRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetRes as any
    );
    const assetId = assetRes.body?.data?.assetId;

    const planARes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans`,
        body: { title: "A" }
      }) as any,
      planARes as any
    );
    const planAId = planARes.body?.data?.planId;

    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/${planAId}/assets`,
        body: { assetId }
      }) as any,
      createRes() as any
    );

    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/${planAId}/share`
      }) as any,
      createRes() as any
    );

    const planBRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans`,
        body: { title: "B" }
      }) as any,
      planBRes as any
    );
    const planBId = planBRes.body?.data?.planId;

    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/${planBId}/assets`,
        body: { assetId }
      }) as any,
      createRes() as any
    );

    const shareBRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/${planBId}/share`
      }) as any,
      shareBRes as any
    );

    expect(shareBRes.statusCode).toBe(400);
  });

  it("lists case plan assets", async () => {
    const caseRepo = new FirestoreCaseRepository();
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      caseRes as any
    );
    const caseId = caseRes.body?.data?.caseId;

    const assetRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetRes as any
    );
    const assetId = assetRes.body?.data?.assetId;

    const planRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans`,
        body: { title: "A" }
      }) as any,
      planRes as any
    );
    const planId = planRes.body?.data?.planId;

    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/${planId}/assets`,
        body: { assetId }
      }) as any,
      createRes() as any
    );

    const listRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/plans/${planId}/assets`
      }) as any,
      listRes as any
    );

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body?.data?.length).toBe(1);
    expect(listRes.body?.data?.[0]?.assetLabel).toBe("XRP Wallet");
  });

  it("lists case plans", async () => {
    const caseRepo = new FirestoreCaseRepository();
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      caseRes as any
    );
    const caseId = caseRes.body?.data?.caseId;

    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans`,
        body: { title: "A" }
      }) as any,
      createRes() as any
    );

    const listRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/plans`
      }) as any,
      listRes as any
    );

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body?.data?.length).toBe(1);
  });

  it("lists shared plans for case members", async () => {
    const caseRepo = new FirestoreCaseRepository();
    const ownerHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseRes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      caseRes as any
    );
    const caseId = caseRes.body?.data?.caseId;

    const planARes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans`,
        body: { title: "A" }
      }) as any,
      planARes as any
    );
    const planAId = planARes.body?.data?.planId;

    const planBRes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans`,
        body: { title: "B" }
      }) as any,
      planBRes as any
    );
    const planBId = planBRes.body?.data?.planId;

    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/${planAId}/share`
      }) as any,
      createRes() as any
    );

    await getFirestore()
      .collection("cases")
      .doc(caseId)
      .set({ memberUids: ["owner_1", "heir_1"] }, { merge: true });

    const memberHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const listRes = createRes();
    await memberHandler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/plans`
      }) as any,
      listRes as any
    );

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body?.data?.length).toBe(1);
    expect(listRes.body?.data?.[0]?.planId).toBe(planAId);

    const sharedRes = createRes();
    await memberHandler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/plans/${planAId}`
      }) as any,
      sharedRes as any
    );

    expect(sharedRes.statusCode).toBe(200);

    const blockedRes = createRes();
    await memberHandler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/plans/${planBId}`
      }) as any,
      blockedRes as any
    );

    expect(blockedRes.statusCode).toBe(403);
  });
});
