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
import { encryptPayload } from "./utils/encryption";

const authState = {
  existingEmails: new Set<string>(),
  users: new Map<string, { email?: string | null }>()
};
const authTokens = new Map<string, { uid: string; email?: string | null; admin?: boolean }>();
const storageMocks = vi.hoisted(() => {
  const getSignedUrl = vi.fn(async () => ["https://storage.example.com/signed"]);
  const download = vi.fn(async () => [Buffer.from("dummy-file")]);
  const file = vi.fn(() => ({ getSignedUrl, download }));
  const bucket = vi.fn(() => ({ file }));
  return { getSignedUrl, download, file, bucket };
});

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
      id: this.id,
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

class MockCollectionGroupQuery {
  constructor(
    private readonly collectionId: string,
    private readonly filters: Array<{ field: string; value: any }>
  ) {}

  where(field: string, _op: string, value: any) {
    return new MockCollectionGroupQuery(this.collectionId, [...this.filters, { field, value }]);
  }

  orderBy(_field: string, _direction?: "asc" | "desc") {
    return this;
  }

  limit(_count: number) {
    return this;
  }

  async get() {
    const docs: Array<{ id: string; data: () => StoredDoc; ref: MockDocRef }> = [];
    for (const [collectionName, collection] of store.entries()) {
      if (
        collectionName === this.collectionId ||
        collectionName.endsWith(`/${this.collectionId}`)
      ) {
        for (const [id, data] of collection.entries()) {
          if (this.filters.every((filter) => data[filter.field] === filter.value)) {
            docs.push({
              id,
              data: () => data,
              ref: new MockDocRef(collectionName, id)
            });
          }
        }
      }
    }
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
    collection: (name: string) => new MockCollectionRef(name),
    collectionGroup: (name: string) => new MockCollectionGroupQuery(name, [])
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

vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({
    bucket: storageMocks.bucket
  })
}));

vi.mock("@kototsute/shared", async () => {
  const actual = await vi.importActual<typeof import("@kototsute/shared")>(
    "@kototsute/shared"
  );
  return {
    ...actual,
    assetLabelUpdateSchema:
      (actual as any).assetLabelUpdateSchema ??
      (actual as any).assetCreateSchema.pick({ label: true }),
    sendXrpPayment: async () => ({ txHash: "tx-xrp" }),
    sendTokenPayment: async () => ({ txHash: "tx-token" }),
    sendSignerListSet: async () => ({ txHash: "tx-signer" }),
    createNftSellOffer: async () => ({ offerId: "offer-1", txHash: "tx-nft" }),
    getWalletAddressFromSeed: vi.fn(() => "rDest"),
    createLocalXrplWallet: vi.fn(() => ({
      address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      seed: "sLocal"
    }))
  };
});

vi.mock("./utils/xrpl", async () => {
  const actual = await vi.importActual<typeof import("./utils/xrpl")>("./utils/xrpl");
  return {
    ...actual,
    createChallenge: () => "memo_123"
  };
});

const prepareApprovalTxMock = vi.hoisted(() =>
  vi.fn(async () => ({
    TransactionType: "Payment",
    Account: "rLock",
    Destination: "rVerify",
    Amount: "1"
  }))
);

vi.mock("./utils/xrpl-multisign", () => ({
  prepareApprovalTx: prepareApprovalTxMock,
  signForMultisign: () => ({ blob: "blob-system", hash: "hash-system" }),
  decodeSignedBlob: () => ({
    TransactionType: "Payment",
    Account: "rLock",
    Destination: "rVerify",
    Amount: "1",
    Memos: [{ Memo: { MemoData: "6D656D6F5F616263" } }],
    Signers: [{ Signer: { Account: "rHeir" } }],
    SigningPubKey: ""
  }),
  combineMultisignedBlobs: () => ({
    blob: "blob-combined",
    txJson: { TransactionType: "Payment" }
  }),
  submitMultisignedTx: async () => ({ txHash: "tx-final" })
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

const createResWithSend = (): MockRes & { send: (body: any) => MockRes } => {
  return {
    ...createRes(),
    send(body: any) {
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

  it("adds heir from accepted invite", async () => {
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

    const planSnap = await db.collection("plans").doc(planId).get();
    expect(planSnap.data()?.status).toBeUndefined();
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

  it("updates nft allocations", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_nft_plan";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1"]
    });
    await db.collection(`cases/${caseId}/plans`).doc("plan-1").set({
      planId: "plan-1",
      ownerUid: "owner_1",
      heirUids: ["heir_1"],
      heirs: [{ uid: "heir_1", email: "heir@example.com" }]
    });
    await db.collection(`cases/${caseId}/plans/plan-1/assets`).doc("plan-asset-1").set({
      planAssetId: "plan-asset-1",
      assetId: "asset-1",
      unitType: "PERCENT",
      allocations: []
    });

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/plan-1/assets/plan-asset-1/nfts`,
        body: { allocations: [{ tokenId: "nft-1", heirUid: "heir_1" }] }
      }) as any,
      res as any
    );

    const snap = await db
      .collection(`cases/${caseId}/plans/plan-1/assets`)
      .doc("plan-asset-1")
      .get();
    expect(snap.data()?.nftAllocations?.[0]?.tokenId).toBe("nft-1");
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

  it("updates invite relation and memo", async () => {
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

    const inviteRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites`,
        body: { email: "heir@example.com", relationLabel: "長男", memo: "初回メモ" }
      }) as any,
      inviteRes as any
    );
    const inviteId = inviteRes.body?.data?.inviteId;

    const updateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "PATCH",
        path: `/v1/cases/${caseId}/invites/${inviteId}`,
        body: {
          relationLabel: "その他",
          relationOther: "甥の配偶者",
          memo: "更新後メモ"
        }
      }) as any,
      updateRes as any
    );

    expect(updateRes.statusCode).toBe(200);

    const inviteSnap = await getFirestore()
      .collection(`cases/${caseId}/invites`)
      .doc(inviteId)
      .get();
    expect(inviteSnap.data()?.relationLabel).toBe("その他");
    expect(inviteSnap.data()?.relationOther).toBe("甥の配偶者");
    expect(inviteSnap.data()?.memo).toBe("更新後メモ");
  });

  it("rejects case invite when heir limit exceeded", async () => {
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

    const invitesRef = getFirestore().collection(`cases/${caseId}/invites`);
    for (let i = 0; i < 30; i++) {
      await invitesRef.doc(`invite_${i}`).set({
        email: `heir${i}@example.com`,
        status: "pending"
      });
    }

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites`,
        body: { email: "extra@example.com", relationLabel: "長男" }
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("HEIR_LIMIT_REACHED");
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

  it("includes walletStatus for case heirs", async () => {
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

    const inviteEmails = ["heir1@example.com", "heir2@example.com", "heir3@example.com"];
    const inviteIds: string[] = [];
    for (const email of inviteEmails) {
      const inviteRes = createRes();
      await ownerHandler(
        authedReq("owner_1", "owner@example.com", {
          method: "POST",
          path: `/v1/cases/${caseId}/invites`,
          body: { email, relationLabel: "長男" }
        }) as any,
        inviteRes as any
      );
      inviteIds.push(inviteRes.body?.data?.inviteId);
    }

    const memberHandler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => new Date("2024-01-02T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    await memberHandler(
      authedReq("heir_1", "heir1@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites/${inviteIds[0]}/accept`
      }) as any,
      createRes() as any
    );
    await memberHandler(
      authedReq("heir_2", "heir2@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites/${inviteIds[1]}/accept`
      }) as any,
      createRes() as any
    );
    await memberHandler(
      authedReq("heir_3", "heir3@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/invites/${inviteIds[2]}/accept`
      }) as any,
      createRes() as any
    );

    const db = getFirestore();
    await db
      .collection(`cases/${caseId}/heirWallets`)
      .doc("heir_2")
      .set({ address: "rHeir2", verificationStatus: "PENDING" });
    await db
      .collection(`cases/${caseId}/heirWallets`)
      .doc("heir_3")
      .set({ address: "rHeir3", verificationStatus: "VERIFIED" });

    const listRes = createRes();
    await ownerHandler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/heirs`
      }) as any,
      listRes as any
    );

    const byUid = new Map(
      (listRes.body?.data ?? []).map((item: any) => [item.acceptedByUid, item.walletStatus])
    );
    expect(byUid.get("heir_1")).toBe("UNREGISTERED");
    expect(byUid.get("heir_2")).toBe("PENDING");
    expect(byUid.get("heir_3")).toBe("VERIFIED");
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
    const timestampLike = {
      toDate: () => new Date("2024-01-01T00:00:00.000Z"),
      toJSON: () => ({ seconds: 1704067200, nanoseconds: 0 })
    };
    const caseRepo = new FirestoreCaseRepository();
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo,
      now: () => timestampLike as any,
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
    expect(listRes.body?.data?.[0]?.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(listRes.body?.data?.[0]?.updatedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("returns case asset detail with xrpl info", async () => {
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
            result: { lines: [{ currency: "JPYC", account: "rIssuer", balance: "100" }] }
          })
        } as any;
      }
      if (body.method === "account_nfts") {
        return {
          ok: true,
          json: async () => ({
            result: {
              account_nfts: [
                {
                  NFTokenID: "00090000AABBCC",
                  Issuer: "rIssuer",
                  URI: "68747470733A2F2F6578616D706C652E636F6D2F6E66742F31"
                }
              ]
            }
          })
        } as any;
      }
      return { ok: false, json: async () => ({}) } as any;
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: ["heir_1"],
      heirs: [
        {
          uid: "heir_1",
          email: "heir@example.com",
          relationLabel: "長男",
          relationOther: null
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/assets/${assetId}`,
        query: { includeXrpl: "true" }
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.xrpl?.tokens?.[0]?.currency).toBe("JPYC");
    expect(res.body?.data?.xrpl?.nfts?.[0]?.tokenId).toBe("00090000AABBCC");
    expect(res.body?.data?.xrpl?.nfts?.[0]?.issuer).toBe("rIssuer");
    expect(res.body?.data?.xrpl?.nfts?.[0]?.uri).toBe("https://example.com/nft/1");
  });

  it("returns cached wallet info when includeXrpl is false", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: ["heir_1"],
      heirs: [
        {
          uid: "heir_1",
          email: "heir@example.com",
          relationLabel: "長男",
          relationOther: null
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const db = getFirestore();
    await db.collection(`cases/${caseId}/assets`).doc(assetId).set(
      {
        xrplSummary: {
          status: "ok",
          balanceXrp: "10",
          ledgerIndex: 1,
          tokens: [{ currency: "USD", issuer: "rIssuer", balance: "5" }],
          syncedAt: new Date("2024-01-02T00:00:00.000Z")
        }
      },
      { merge: true }
    );

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/assets/${assetId}`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.xrpl?.balanceXrp).toBe("10");
    expect(res.body?.data?.xrpl?.tokens?.[0]?.balance).toBe("5");
    expect(res.body?.data?.xrpl?.syncedAt).toBeTruthy();
  });

  it("blocks asset lock start when no active plans", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          account_id: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
          master_seed: "sTestSeed"
        }
      })
    }));
    (globalThis as any).fetch = fetchMock;
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "B" }
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("NOT_READY");
    expect(res.body?.message).toBe("相続対象の指図がありません");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("rejects asset lock start when method A is specified", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const startRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "A" }
      }) as any,
      startRes as any
    );

    expect(startRes.statusCode).toBe(400);
    expect(startRes.body?.code).toBe("VALIDATION_ERROR");
  });

  it("blocks asset lock start when an active plan has no heirs", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          account_id: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
          master_seed: "sTestSeed"
        }
      })
    }));
    (globalThis as any).fetch = fetchMock;
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: [],
      heirs: [],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "B" }
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("NOT_READY");
    expect(res.body?.message).toBe("相続人が未設定の指図があります");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("starts asset lock and creates items", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          account_id: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
          master_seed: "sTestSeed"
        }
      })
    }));
    (globalThis as any).fetch = fetchMock;
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: ["heir_1"],
      heirs: [
        {
          uid: "heir_1",
          email: "heir@example.com",
          relationLabel: "長男",
          relationOther: null
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const db = getFirestore();
    await db.collection(`cases/${caseId}/assets`).doc(assetId).set(
      {
        xrplSummary: {
          status: "ok",
          balanceXrp: "10",
          ledgerIndex: 1,
          tokens: [{ currency: "JPYC", issuer: "rIssuer", balance: "5" }],
          syncedAt: new Date("2024-01-01T00:00:00.000Z")
        },
        reserveXrp: "1",
        reserveTokens: [{ currency: "JPYC", issuer: "rIssuer", reserveAmount: "1" }],
        reserveNfts: []
      },
      { merge: true }
    );

    const startRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "B" }
      }) as any,
      startRes as any
    );

    expect(startRes.statusCode).toBe(200);
    const lockSnap = await db
      .collection("cases")
      .doc(caseId)
      .collection("assetLock")
      .doc("state")
      .get();
    expect(lockSnap.exists).toBe(true);
    expect(lockSnap.data()?.uiStep).toBe(3);
    expect(lockSnap.data()?.methodStep).toBe("REGULAR_KEY_SET");
    expect(fetchMock).toHaveBeenCalled();
    expect(lockSnap.data()?.wallet?.address).toBe("rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe");
    const itemsSnap = await db.collection("cases").doc(caseId).collection("assetLockItems").get();
    expect(itemsSnap.docs.length).toBe(2);
    (globalThis as any).fetch = fetchOriginal;
  });

  it("blocks asset lock start when heir wallet not verified after death confirmed", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_1";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1", "heir_2"],
      stage: "IN_PROGRESS"
    });
    const planRef = db.collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: ["heir_1"],
      heirs: [
        {
          uid: "heir_1",
          email: "heir@example.com",
          relationLabel: "長男",
          relationOther: null
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rAddr1",
      verificationStatus: "VERIFIED"
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_2").set({
      address: "rAddr2",
      verificationStatus: null
    });

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "B" }
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("WALLET_NOT_VERIFIED");
  });

  it("falls back when wallet propose returns invalid address", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          account_id: "rb50736258607a0e8378887789",
          master_seed: "sTestSeed"
        }
      })
    }));
    (globalThis as any).fetch = fetchMock;
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: ["heir_1"],
      heirs: [
        {
          uid: "heir_1",
          email: "heir@example.com",
          relationLabel: "長男",
          relationOther: null
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const startRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "B" }
      }) as any,
      startRes as any
    );

    expect(startRes.statusCode).toBe(200);
    const lockSnap = await getFirestore()
      .collection("cases")
      .doc(caseId)
      .collection("assetLock")
      .doc("state")
      .get();
    const address = lockSnap.data()?.wallet?.address ?? "";
    expect(address).not.toBe("rb50736258607a0e8378887789");
    expect(address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/);
    (globalThis as any).fetch = fetchOriginal;
  });

  it("verifies regular key and updates method step", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "wallet_propose") {
        return {
          ok: true,
          json: async () => ({
            result: {
              account_id: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
              master_seed: "sWalletSeed"
            }
          })
        };
      }
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: {
              account_data: {
                Balance: "0",
                RegularKey: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
              },
              ledger_index: 1
            }
          })
        };
      }
      return {
        ok: false,
        json: async () => ({ error_message: "unexpected" })
      };
    });
    (globalThis as any).fetch = fetchMock;
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: ["heir_1"],
      heirs: [
        {
          uid: "heir_1",
          email: "heir@example.com",
          relationLabel: "長男",
          relationOther: null
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const db = getFirestore();
    await db.collection(`cases/${caseId}/assets`).doc(assetId).set(
      {
        xrplSummary: {
          status: "ok",
          balanceXrp: "10",
          ledgerIndex: 1,
          tokens: [],
          syncedAt: new Date("2024-01-01T00:00:00.000Z")
        },
        reserveXrp: "1",
        reserveTokens: [],
        reserveNfts: []
      },
      { merge: true }
    );

    const startRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "B" }
      }) as any,
      startRes as any
    );
    expect(startRes.statusCode).toBe(200);

    const verifyRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/regular-key/verify`
      }) as any,
      verifyRes as any
    );

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body?.data?.methodStep).toBe("AUTO_TRANSFER");
    expect(verifyRes.body?.data?.regularKeyStatuses?.[0]?.status).toBe("VERIFIED");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("verifies regular key when lock items are empty", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "10000000", RegularKey: "rDest" } }
          })
        };
      }
      return {
        ok: false,
        json: async () => ({ error_message: "unexpected" })
      };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection(`cases/${caseId}/assets`).doc("asset-1").set({
      label: "XRP Wallet",
      address: "rFrom"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      status: "READY",
      method: "B",
      wallet: { address: "rDest" }
    });

    const verifyRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/regular-key/verify`
      }) as any,
      verifyRes as any
    );

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body?.data?.methodStep).toBe("AUTO_TRANSFER");
    expect(verifyRes.body?.data?.regularKeyStatuses).toHaveLength(1);
    expect(verifyRes.body?.data?.regularKeyStatuses?.[0]?.status).toBe("VERIFIED");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("replaces existing asset lock items on restart", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          account_id: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
          master_seed: "sTestSeed"
        }
      })
    }));
    (globalThis as any).fetch = fetchMock;
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: ["heir_1"],
      heirs: [
        {
          uid: "heir_1",
          email: "heir@example.com",
          relationLabel: "長男",
          relationOther: null
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const db = getFirestore();
    await db.collection(`cases/${caseId}/assets`).doc(assetId).set(
      {
        xrplSummary: {
          status: "ok",
          balanceXrp: "10",
          ledgerIndex: 1,
          tokens: [],
          syncedAt: new Date("2024-01-01T00:00:00.000Z")
        },
        reserveXrp: "1",
        reserveTokens: [],
        reserveNfts: []
      },
      { merge: true }
    );

    await db.collection("cases").doc(caseId).collection("assetLockItems").doc("old-item").set({
      itemId: "old-item",
      assetId,
      assetLabel: "XRP Wallet",
      assetAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      token: null,
      plannedAmount: "1",
      status: "PENDING",
      txHash: null,
      error: null
    });

    const startRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "B" }
      }) as any,
      startRes as any
    );

    expect(startRes.statusCode).toBe(200);
    const itemsSnap = await db.collection("cases").doc(caseId).collection("assetLockItems").get();
    const itemIds = itemsSnap.docs.map((doc) => doc.id);
    expect(itemIds).not.toContain("old-item");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("skips asset lock items when planned amount is zero", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          account_id: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
          master_seed: "sTestSeed"
        }
      })
    }));
    (globalThis as any).fetch = fetchMock;
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: "owner_1",
      title: "指図A",
      sharedAt: null,
      heirUids: ["heir_1"],
      heirs: [
        {
          uid: "heir_1",
          email: "heir@example.com",
          relationLabel: "長男",
          relationOther: null
        }
      ],
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const db = getFirestore();
    await db.collection(`cases/${caseId}/assets`).doc(assetId).set(
      {
        xrplSummary: {
          status: "ok",
          balanceXrp: "1",
          ledgerIndex: 1,
          tokens: [{ currency: "JPYC", issuer: "rIssuer", balance: "2" }],
          syncedAt: new Date("2024-01-01T00:00:00.000Z")
        },
        reserveXrp: "1",
        reserveTokens: [{ currency: "JPYC", issuer: "rIssuer", reserveAmount: "2" }],
        reserveNfts: []
      },
      { merge: true }
    );

    const startRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/start`,
        body: { method: "B" }
      }) as any,
      startRes as any
    );

    expect(startRes.statusCode).toBe(200);
    const itemsSnap = await db.collection("cases").doc(caseId).collection("assetLockItems").get();
    expect(itemsSnap.docs.length).toBe(0);
    (globalThis as any).fetch = fetchOriginal;
  });

  it("returns draft asset lock when not started", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/asset-lock`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.status).toBe("DRAFT");
    expect(res.body?.data?.method ?? null).toBeNull();
    expect(res.body?.data?.wallet ?? null).toBeNull();
    expect(res.body?.data?.items ?? []).toHaveLength(0);
  });

  it("verifies asset lock tx", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: { Account: "rFrom", Destination: "rDest", Amount: "9", Memos: [] }
      })
    }));
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "A",
      wallet: { address: "rDest" }
    });
    const itemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
    await itemRef.set({
      itemId: itemRef.id,
      assetId: "asset-1",
      assetLabel: "XRP",
      assetAddress: "rFrom",
      token: null,
      plannedAmount: "9",
      status: "PENDING",
      txHash: null,
      error: null
    });

    const verifyRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/verify`,
        body: { itemId: itemRef.id, txHash: "tx" }
      }) as any,
      verifyRes as any
    );

    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body?.data?.items ?? []).toHaveLength(1);
    expect(verifyRes.body?.data?.items?.[0]?.status).toBe("VERIFIED");
    expect(verifyRes.body?.data?.items?.[0]?.txHash).toBe("tx");
    const itemSnap = await itemRef.get();
    expect(itemSnap.data()?.status).toBe("VERIFIED");
  });

  it("returns asset lock state with persisted steps", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "B",
      uiStep: 3,
      methodStep: "AUTO_TRANSFER",
      wallet: { address: "rDest" }
    });

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/asset-lock`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.uiStep).toBe(3);
    expect(res.body?.data?.methodStep).toBe("AUTO_TRANSFER");
  });
  it("executes asset lock for method B", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: { account_data: { Balance: "100000000" } }
      })
    }));
    (globalThis as any).fetch = fetchMock;
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assets").doc("asset-1").set({
      address: "rFrom",
      reserveXrp: "0",
      label: "Wallet"
    });
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "B",
      wallet: {
        address: "rDest",
        seedEncrypted: {
          cipherText: "s0VGcg==",
          iv: "tasbbazBesggLHbW",
          tag: "21JedH/zOM4g5O96O1GoLw==",
          version: 1
        }
      },
      regularKeyStatuses: [
        {
          assetId: "asset-1",
          assetLabel: "Wallet",
          address: "rFrom",
          status: "VERIFIED",
          message: null
        }
      ]
    });

    const itemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
    await itemRef.set({
      itemId: itemRef.id,
      assetId: "asset-1",
      assetLabel: "XRP",
      assetAddress: "rFrom",
      token: null,
      plannedAmount: "1",
      status: "PENDING",
      txHash: null,
      error: null
    });

    const execRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/execute`
      }) as any,
      execRes as any
    );

    expect(execRes.statusCode).toBe(200);
    expect(execRes.body?.data?.items ?? []).toHaveLength(1);
    expect(execRes.body?.data?.items?.[0]?.status).toBe("VERIFIED");
    expect(execRes.body?.data?.items?.[0]?.txHash).toBe("tx-xrp");
    const itemSnap = await itemRef.get();
    expect(itemSnap.data()?.status).toBe("VERIFIED");
    const lockSnap = await db.collection("cases").doc(caseId).collection("assetLock").doc("state").get();
    expect(lockSnap.data()?.methodStep).toBe("REGULAR_KEY_CLEARED");
    const caseSnap = await db.collection("cases").doc(caseId).get();
    expect(caseSnap.data()?.stage).toBe("WAITING");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("executes asset lock for method B even when items are empty", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "B",
      wallet: {
        address: "rDest",
        seedEncrypted: encryptPayload("seed")
      },
      regularKeyStatuses: [
        {
          assetId: "asset-1",
          assetLabel: "Wallet",
          address: "rFrom",
          status: "VERIFIED",
          message: null
        }
      ]
    });

    const execRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/execute`
      }) as any,
      execRes as any
    );

    expect(execRes.statusCode).toBe(200);
    expect(execRes.body?.data?.items ?? []).toHaveLength(0);
    expect(execRes.body?.data?.methodStep).toBe("REGULAR_KEY_CLEARED");
    const caseSnap = await db.collection("cases").doc(caseId).get();
    expect(caseSnap.data()?.stage).toBe("WAITING");
  });

  it("adjusts xrp amount before execute when balance is short", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "100000000", OwnerCount: 0 } }
          })
        };
      }
      if (body?.method === "server_state") {
        return {
          ok: true,
          json: async () => ({
            result: {
              state: { validated_ledger: { reserve_base: "10000000", reserve_inc: "2000000" } }
            }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assets").doc("asset-1").set({
      address: "rFrom",
      reserveXrp: "0",
      label: "Wallet"
    });
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "B",
      wallet: { address: "rDest", seedEncrypted: encryptPayload("seed") },
      regularKeyStatuses: [
        {
          assetId: "asset-1",
          assetLabel: "Wallet",
          address: "rFrom",
          status: "VERIFIED",
          message: null
        }
      ]
    });

    const xrpItemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
    await xrpItemRef.set({
      itemId: xrpItemRef.id,
      assetId: "asset-1",
      assetLabel: "XRP",
      assetAddress: "rFrom",
      token: null,
      plannedAmount: "100000000",
      status: "PENDING",
      txHash: null,
      error: null
    });
    const tokenItemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
    await tokenItemRef.set({
      itemId: tokenItemRef.id,
      assetId: "asset-1",
      assetLabel: "Token",
      assetAddress: "rFrom",
      token: { currency: "USD", issuer: "rIssuer", isNative: false },
      plannedAmount: "5",
      status: "PENDING",
      txHash: null,
      error: null
    });

    const execRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/execute`
      }) as any,
      execRes as any
    );

    expect(execRes.statusCode).toBe(200);
    const updated = await xrpItemRef.get();
    expect(updated.data()?.plannedAmount).toBe("89999976");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("returns insufficient balance when fee cannot be covered", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "10", OwnerCount: 0 } }
          })
        };
      }
      if (body?.method === "server_state") {
        return {
          ok: true,
          json: async () => ({
            result: {
              state: { validated_ledger: { reserve_base: "10000000", reserve_inc: "2000000" } }
            }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assets").doc("asset-1").set({
      address: "rFrom",
      reserveXrp: "0",
      label: "Wallet"
    });
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "B",
      wallet: { address: "rDest", seedEncrypted: encryptPayload("seed") },
      regularKeyStatuses: [
        {
          assetId: "asset-1",
          assetLabel: "Wallet",
          address: "rFrom",
          status: "VERIFIED",
          message: null
        }
      ]
    });

    const xrpItemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
    await xrpItemRef.set({
      itemId: xrpItemRef.id,
      assetId: "asset-1",
      assetLabel: "XRP",
      assetAddress: "rFrom",
      token: null,
      plannedAmount: "1",
      status: "PENDING",
      txHash: null,
      error: null
    });

    const execRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/execute`
      }) as any,
      execRes as any
    );

    expect(execRes.statusCode).toBe(400);
    expect(execRes.body?.code).toBe("INSUFFICIENT_BALANCE");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("returns asset lock balances", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method !== "account_info") {
        return { ok: false, json: async () => ({}) };
      }
      const account = body?.params?.[0]?.account;
      if (account === "rFrom") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "10000000" } }
          })
        };
      }
      if (account === "rDest") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "20000000" } }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assets").doc("asset-1").set({
      address: "rFrom",
      reserveXrp: "0",
      label: "Wallet"
    });
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "B",
      wallet: { address: "rDest" }
    });
    const itemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
    await itemRef.set({
      itemId: itemRef.id,
      assetId: "asset-1",
      assetLabel: "XRP",
      assetAddress: "rFrom",
      token: null,
      plannedAmount: "1",
      status: "PENDING",
      txHash: null,
      error: null
    });

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/asset-lock/balances`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.destination?.address).toBe("rDest");
    expect(res.body?.data?.destination?.balanceXrp).toBe("20");
    expect(res.body?.data?.sources?.[0]?.assetId).toBe("asset-1");
    expect(res.body?.data?.sources?.[0]?.balanceXrp).toBe("10");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("returns asset lock balances when items are empty", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method !== "account_info") {
        return { ok: false, json: async () => ({}) };
      }
      const account = body?.params?.[0]?.account;
      if (account === "rFrom") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "10000000" } }
          })
        };
      }
      if (account === "rDest") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "20000000" } }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assets").doc("asset-1").set({
      address: "rFrom",
      reserveXrp: "0",
      label: "Wallet"
    });
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "B",
      wallet: { address: "rDest" }
    });

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/asset-lock/balances`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.destination?.address).toBe("rDest");
    expect(res.body?.data?.destination?.balanceXrp).toBe("20");
    expect(res.body?.data?.sources?.[0]?.assetId).toBe("asset-1");
    expect(res.body?.data?.sources?.[0]?.balanceXrp).toBe("10");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("rejects execute when regular key seed does not match wallet address", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    vi.mocked(
      await import("@kototsute/shared")
    ).getWalletAddressFromSeed.mockReturnValueOnce("rOther");

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "B",
      wallet: {
        address: "rDest",
        seedEncrypted: encryptPayload("seed")
      },
      regularKeyStatuses: [
        {
          assetId: "asset-1",
          assetLabel: "Wallet",
          address: "rFrom",
          status: "VERIFIED",
          message: null
        }
      ]
    });

    const execRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/execute`
      }) as any,
      execRes as any
    );

    expect(execRes.statusCode).toBe(400);
    expect(execRes.body?.code).toBe("REGULAR_KEY_SEED_MISMATCH");
  });

  it("completes asset lock and updates case stage", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).collection("assetLock").doc("state").set({
      status: "READY",
      method: "A",
      uiStep: 4,
      methodStep: null,
      wallet: { address: "rDest" }
    });
    const itemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
    await itemRef.set({
      itemId: itemRef.id,
      assetId: "asset-1",
      assetLabel: "XRP",
      assetAddress: "rFrom",
      token: null,
      plannedAmount: "1",
      status: "VERIFIED",
      txHash: "tx",
      error: null
    });

    const completeRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/complete`
      }) as any,
      completeRes as any
    );

    expect(completeRes.statusCode).toBe(200);
    const caseSnap = await db.collection("cases").doc(caseId).get();
    expect(caseSnap.data()?.assetLockStatus).toBe("LOCKED");
    expect(caseSnap.data()?.stage).toBe("WAITING");
    const lockSnap = await db.collection("cases").doc(caseId).collection("assetLock").doc("state").get();
    expect(lockSnap.data()?.status).toBe("LOCKED");
  });

  it("updates asset lock progress state", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const updateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "PATCH",
        path: `/v1/cases/${caseId}/asset-lock/state`,
        body: { uiStep: 2, methodStep: "AUTO_TRANSFER" }
      }) as any,
      updateRes as any
    );

    expect(updateRes.statusCode).toBe(200);
    const lockSnap = await getFirestore()
      .collection("cases")
      .doc(caseId)
      .collection("assetLock")
      .doc("state")
      .get();
    expect(lockSnap.data()?.uiStep).toBe(2);
    expect(lockSnap.data()?.methodStep).toBe("AUTO_TRANSFER");
  });

  it("rejects auto transfer step without regular key verification", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db
      .collection("cases")
      .doc(caseId)
      .collection("assetLock")
      .doc("state")
      .set({
        status: "READY",
        method: "B",
        uiStep: 3,
        methodStep: "REGULAR_KEY_SET",
        regularKeyStatuses: [
          {
            assetId: "asset-1",
            assetLabel: "Wallet",
            address: "rFrom",
            status: "UNVERIFIED",
            message: "RegularKeyが一致しません"
          }
        ]
      });

    const updateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "PATCH",
        path: `/v1/cases/${caseId}/asset-lock/state`,
        body: { methodStep: "AUTO_TRANSFER" }
      }) as any,
      updateRes as any
    );

    expect(updateRes.statusCode).toBe(400);
  });

  it("rejects asset lock execute when regular key is unverified", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db
      .collection("cases")
      .doc(caseId)
      .collection("assetLock")
      .doc("state")
      .set({
        status: "READY",
        method: "B",
        uiStep: 3,
        methodStep: "REGULAR_KEY_SET",
        regularKeyStatuses: [
          {
            assetId: "asset-1",
            assetLabel: "Wallet",
            address: "rFrom",
            status: "UNVERIFIED",
            message: "RegularKeyが一致しません"
          }
        ],
        wallet: {
          address: "rDest",
          seedEncrypted: {
            cipherText: "s0VGcg==",
            iv: "tasbbazBesggLHbW",
            tag: "21JedH/zOM4g5O96O1GoLw==",
            version: 1
          }
        }
      });

    const itemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
    await itemRef.set({
      itemId: itemRef.id,
      assetId: "asset-1",
      assetLabel: "XRP",
      assetAddress: "rFrom",
      token: null,
      plannedAmount: "1",
      status: "PENDING",
      txHash: null,
      error: null
    });

    const execRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/asset-lock/execute`
      }) as any,
      execRes as any
    );

    expect(execRes.statusCode).toBe(400);
  });

  it("returns empty heir wallet when not registered", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({ memberUids: ["heir_1"] }, { merge: true });

    const res = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/heir-wallet`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.address ?? null).toBeNull();
    expect(res.body?.data?.verificationStatus ?? null).toBeNull();
  });

  it("allows heir to register wallet and verify ownership", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({ memberUids: ["heir_1"] }, { merge: true });

    const registerRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/heir-wallet`,
        body: { address: "rHeirWallet" }
      }) as any,
      registerRes as any
    );
    expect(registerRes.statusCode).toBe(200);

    const challengeRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/heir-wallet/verify/challenge`
      }) as any,
      challengeRes as any
    );
    expect(challengeRes.statusCode).toBe(200);
    const challenge = challengeRes.body?.data?.challenge;
    expect(typeof challenge).toBe("string");

    const memoHex = Buffer.from(String(challenge)).toString("hex");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          Account: "rHeirWallet",
          Destination: "rp7W5EetJmFuACL7tT1RJNoLE4S92Pg1JS",
          Amount: "1",
          Memos: [{ Memo: { MemoData: memoHex } }]
        }
      })
    }));
    (globalThis as any).fetch = fetchMock;

    const verifyRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/heir-wallet/verify/confirm`,
        body: { txHash: "tx_hash" }
      }) as any,
      verifyRes as any
    );
    expect(verifyRes.statusCode).toBe(200);

    const detailRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/heir-wallet`
      }) as any,
      detailRes as any
    );
    expect(detailRes.body?.data?.address).toBe("rHeirWallet");
    expect(detailRes.body?.data?.verificationStatus).toBe("VERIFIED");
  });

  it("forbids owner from managing heir wallet", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/heir-wallet`,
        body: { address: "rOwnerWallet" }
      }) as any,
      res as any
    );
    expect(res.statusCode).toBe(403);
  });

  it("lists asset history with sync logs", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/assets/${assetId}/history`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body?.data)).toBe(true);
  });

  it("updates asset reserve settings", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const updateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "PATCH",
        path: `/v1/cases/${caseId}/assets/${assetId}/reserve`,
        body: {
          reserveXrp: "1.5",
          reserveTokens: [{ currency: "USD", issuer: "rIssuer", reserveAmount: "10" }]
        }
      }) as any,
      updateRes as any
    );
    expect(updateRes.statusCode).toBe(200);

    const detailRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/assets/${assetId}`
      }) as any,
      detailRes as any
    );
    expect(detailRes.body?.data?.reserveXrp).toBe("1.5");
    expect(detailRes.body?.data?.reserveTokens?.length).toBe(1);
  });

  it("updates asset label", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const updateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "PATCH",
        path: `/v1/cases/${caseId}/assets/${assetId}`,
        body: { label: "新しい資産名" }
      }) as any,
      updateRes as any
    );
    expect(updateRes.statusCode).toBe(200);

    const detailRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/assets/${assetId}`
      }) as any,
      detailRes as any
    );
    expect(detailRes.body?.data?.label).toBe("新しい資産名");
  });

  it("rejects case asset deletion when related plan exists", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new FirestoreCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const createCaseRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases",
        body: { ownerDisplayName: "山田" }
      }) as any,
      createCaseRes as any
    );
    const caseId = createCaseRes.body?.data?.caseId;

    const assetCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/assets`,
        body: { label: "XRP Wallet", address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" }
      }) as any,
      assetCreateRes as any
    );
    const assetId = assetCreateRes.body?.data?.assetId;

    const planCreateRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans`,
        body: { title: "プランA" }
      }) as any,
      planCreateRes as any
    );
    const planId = planCreateRes.body?.data?.planId;

    const addAssetRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/${planId}/assets`,
        body: { assetId }
      }) as any,
      addAssetRes as any
    );

    const delRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "DELETE",
        path: `/v1/cases/${caseId}/assets/${assetId}`
      }) as any,
      delRes as any
    );

    expect(delRes.statusCode).toBe(409);
    expect(delRes.body?.code).toBe("ASSET_IN_USE");
    expect(delRes.body?.data?.relatedPlans?.length).toBe(1);
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

    const addAssetRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/plans/${planId}/assets`,
        body: { assetId }
      }) as any,
      addAssetRes as any
    );
    const planAssetId = addAssetRes.body?.data?.planAssetId;

    const db = getFirestore();
    await db.collection(`cases/${caseId}/assets`).doc(assetId).set(
      {
        reserveNfts: ["nft-1"],
        xrplSummary: {
          status: "ok",
          balanceXrp: "0",
          ledgerIndex: 1,
          tokens: [],
          nfts: [
            { tokenId: "nft-1", issuer: "rIssuer", uri: "https://example.com/nft/1" },
            { tokenId: "nft-2", issuer: "rIssuer", uri: "https://example.com/nft/2" }
          ]
        }
      },
      { merge: true }
    );
    if (planAssetId) {
      await db.collection(`cases/${caseId}/plans/${planId}/assets`).doc(planAssetId).set(
        {
          nftAllocations: [
            { tokenId: "nft-1", heirUid: "heir_1" },
            { tokenId: "nft-2", heirUid: "heir_2" }
          ]
        },
        { merge: true }
      );
    }

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
    expect(listRes.body?.data?.[0]?.nfts?.length).toBe(1);
    expect(listRes.body?.data?.[0]?.nfts?.[0]?.tokenId).toBe("nft-2");
    expect(listRes.body?.data?.[0]?.nftAllocations?.length).toBe(1);
    expect(listRes.body?.data?.[0]?.nftAllocations?.[0]?.tokenId).toBe("nft-2");
  });

  it("deletes case plan when no assets", async () => {
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

    const deleteRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "DELETE",
        path: `/v1/cases/${caseId}/plans/${planId}`
      }) as any,
      deleteRes as any
    );

    expect(deleteRes.statusCode).toBe(200);
    const deleted = await getFirestore().collection(`cases/${caseId}/plans`).doc(planId).get();
    expect(deleted.exists).toBe(false);
  });

  it("rejects case plan deletion when assets exist", async () => {
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

    const deleteRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "DELETE",
        path: `/v1/cases/${caseId}/plans/${planId}`
      }) as any,
      deleteRes as any
    );

    expect(deleteRes.statusCode).toBe(400);
    expect(deleteRes.body?.message).toBe("資産が追加されているため削除できません");
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
    expect(listRes.body?.data?.[0]?.assetCount).toBe(0);
    expect(listRes.body?.data?.[0]?.heirCount).toBe(0);
  });

  it("lists plans that include the member as heir", async () => {
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

    await getFirestore()
      .collection(`cases/${caseId}/plans`)
      .doc(planAId)
      .set(
        {
          heirUids: ["heir_1"],
          heirs: [{ uid: "heir_1", email: "heir@example.com" }]
        },
        { merge: true }
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

  it("rejects share/unshare endpoints", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    await getFirestore().collection("cases").doc("case_1").set({
      caseId: "case_1",
      ownerUid: "owner_1",
      memberUids: ["owner_1"],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await getFirestore().collection("cases/case_1/plans").doc("plan_1").set({
      planId: "plan_1",
      ownerUid: "owner_1",
      title: "A",
      heirUids: [],
      heirs: []
    });

    const shareRes = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "POST",
        path: "/v1/cases/case_1/plans/plan_1/share"
      }) as any,
      shareRes as any
    );

    expect(shareRes.statusCode).toBe(404);
  });

  it("creates death claim and returns latest", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      ownerDisplayName: "Owner",
      memberUids: ["owner_1", "heir_1"],
      stage: "WAITING",
      assetLockStatus: "LOCKED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const submitRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/death-claims`
      }) as any,
      submitRes as any
    );

    expect(submitRes.statusCode).toBe(200);

    const listRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/death-claims`
      }) as any,
      listRes as any
    );

    expect(listRes.body?.data?.claim?.status).toBe("SUBMITTED");
    expect(listRes.body?.data?.files?.length ?? 0).toBe(0);
  });

  it("issues upload request and registers file", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "WAITING",
      assetLockStatus: "LOCKED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc("claim_1");
    await claimRef.set({
      submittedByUid: "heir_1",
      status: "SUBMITTED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const issueRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/death-claims/claim_1/upload-requests`,
        body: { fileName: "death.pdf", contentType: "application/pdf", size: 1024 }
      }) as any,
      issueRes as any
    );

    expect(issueRes.body?.data?.requestId).toBeTruthy();

    const fileRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/death-claims/claim_1/files`,
        body: { requestId: issueRes.body?.data?.requestId }
      }) as any,
      fileRes as any
    );

    expect(fileRes.statusCode).toBe(200);
  });

  it("allows upload request when claim is rejected", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "WAITING",
      assetLockStatus: "LOCKED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc("claim_1");
    await claimRef.set({
      submittedByUid: "heir_1",
      status: "ADMIN_REJECTED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const issueRes = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/death-claims/claim_1/upload-requests`,
        body: { fileName: "death.pdf", contentType: "application/pdf", size: 1024 }
      }) as any,
      issueRes as any
    );

    expect(issueRes.statusCode).toBe(200);
    expect(issueRes.body?.data?.requestId).toBeTruthy();
  });

  it("allows case member to download death claim file", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const claimId = "claim_1";
    const fileId = "file_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "WAITING",
      assetLockStatus: "LOCKED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await db.collection(`cases/${caseId}/deathClaims`).doc(claimId).set({
      submittedByUid: "heir_1",
      status: "SUBMITTED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await db.collection(`cases/${caseId}/deathClaims/${claimId}/files`).doc(fileId).set({
      fileName: "death.pdf",
      contentType: "application/pdf",
      storagePath: `cases/${caseId}/death-claims/${claimId}/${fileId}`,
      createdAt: new Date()
    });

    process.env.STORAGE_BUCKET = "kototsute.firebasestorage.app";

    const res = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/death-claims/${claimId}/files/${fileId}/download`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.dataBase64).toBeTruthy();
  });

  it("allows owner to download even if not in member list", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const claimId = "claim_1";
    const fileId = "file_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["heir_1"],
      stage: "WAITING",
      assetLockStatus: "LOCKED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await db.collection(`cases/${caseId}/deathClaims`).doc(claimId).set({
      submittedByUid: "heir_1",
      status: "SUBMITTED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await db.collection(`cases/${caseId}/deathClaims/${claimId}/files`).doc(fileId).set({
      fileName: "death.pdf",
      contentType: "application/pdf",
      storagePath: `cases/${caseId}/death-claims/${claimId}/${fileId}`,
      createdAt: new Date()
    });

    process.env.STORAGE_BUCKET = "kototsute.firebasestorage.app";

    const res = createRes();
    await handler(
      authedReq("owner_1", "owner@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/death-claims/${claimId}/files/${fileId}/download`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
  });

  it("allows admin to approve death claim", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "WAITING",
      assetLockStatus: "LOCKED",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").set({
      submittedByUid: "heir_1",
      status: "SUBMITTED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const req = authedReq("admin_1", "admin@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/death-claims/claim_1/admin-approve`
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "admin_1", email: "admin@example.com", admin: true });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
  });

  it("allows admin to reject death claim", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_1";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"]
    });
    await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").set({
      submittedByUid: "heir_1",
      status: "SUBMITTED",
      createdAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const req = authedReq("admin_1", "admin@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/death-claims/claim_1/admin-reject`,
      body: { note: "差し戻し理由" }
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "admin_1", email: "admin@example.com", admin: true });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const claimSnap = await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").get();
    expect(claimSnap.data()?.status).toBe("ADMIN_REJECTED");
    expect(claimSnap.data()?.adminReview?.status).toBe("REJECTED");
    expect(claimSnap.data()?.adminReview?.note).toBe("差し戻し理由");
  });

  it("rejects admin prepare approval tx endpoint", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });
    process.env.XRPL_SYSTEM_SIGNER_SEED = "sSystem";
    process.env.XRPL_VERIFY_ADDRESS = "rVerify";

    const db = getFirestore();
    const caseId = "case_approval";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS",
      assetLockStatus: "LOCKED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: {
        address: "rLock",
        seedEncrypted: encryptPayload("sLock")
      }
    });
    await db.collection(`cases/${caseId}/signerList`).doc("state").set({
      status: "SET",
      quorum: 2,
      entries: [
        { account: "rSystem", weight: 1 },
        { account: "rHeir", weight: 1 }
      ]
    });

    const req = authedReq("admin_1", "admin@example.com", {
      method: "POST",
      path: `/v1/admin/cases/${caseId}/signer-list/prepare`
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "admin_1", email: "admin@example.com", admin: true });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(404);
    const approvalSnap = await db
      .collection(`cases/${caseId}/signerList`)
      .doc("approvalTx")
      .get();
    expect(approvalSnap.exists).toBe(false);
  });

  it("allows heir to prepare approval tx", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });
    process.env.XRPL_SYSTEM_SIGNER_ADDRESS = "rSystem";
    process.env.XRPL_SYSTEM_SIGNER_SEED = "sSystem";
    process.env.XRPL_VERIFY_ADDRESS = "rVerify";

    const db = getFirestore();
    const caseId = "case_approval_heir";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS",
      assetLockStatus: "LOCKED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: {
        address: "rLock",
        seedEncrypted: encryptPayload("sLock")
      }
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/signer-list/prepare`
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "heir_1", email: "heir@example.com" });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const approvalSnap = await db
      .collection(`cases/${caseId}/signerList`)
      .doc("approvalTx")
      .get();
    expect(approvalSnap.exists).toBe(true);
  });

  it("prepares approval tx even when txJson contains undefined fields", async () => {
    prepareApprovalTxMock.mockResolvedValueOnce({
      TransactionType: "Payment",
      Account: "rLock",
      Destination: "rVerify",
      Amount: "1",
      NetworkID: undefined
    });

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });
    process.env.XRPL_SYSTEM_SIGNER_ADDRESS = "rSystem";
    process.env.XRPL_SYSTEM_SIGNER_SEED = "sSystem";
    process.env.XRPL_VERIFY_ADDRESS = "rVerify";

    const db = getFirestore();
    const caseId = "case_approval_heir_undefined";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS",
      assetLockStatus: "LOCKED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: {
        address: "rLock",
        seedEncrypted: encryptPayload("sLock")
      }
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/signer-list/prepare`
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "heir_1", email: "heir@example.com" });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const approvalSnap = await db
      .collection(`cases/${caseId}/signerList`)
      .doc("approvalTx")
      .get();
    expect(approvalSnap.exists).toBe(true);
  });

  it("returns default distribution state when missing", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_distribution_default";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "GET",
      path: `/v1/cases/${caseId}/distribution`
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.status).toBe("PENDING");
    expect(res.body?.data?.totalCount).toBe(0);
  });

  it("lists distribution items", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_distribution_items";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/distribution/state/items`).doc("item-1").set({
      type: "NFT",
      tokenId: "nft-1",
      offerId: "offer-1",
      heirUid: "heir_1",
      status: "VERIFIED"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "GET",
      path: `/v1/cases/${caseId}/distribution/items`
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.[0]?.tokenId).toBe("nft-1");
  });

  it("rejects distribution execute when approval tx is not validated", async () => {
    process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "tx") {
        return {
          ok: true,
          json: async () => ({
            result: {
              validated: false,
              LastLedgerSequence: 200
            }
          })
        };
      }
      if (body?.method === "server_state") {
        return {
          ok: true,
          json: async () => ({
            result: {
              state: {
                validated_ledger: { seq: 100, reserve_base: "1000000", reserve_inc: "200000" }
              }
            }
          })
        };
      }
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "1000000000", OwnerCount: 0 } }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_distribution_pending_approval";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      status: "SUBMITTED",
      submittedTxHash: "tx-hash"
    });
    await db.collection(`cases/${caseId}/plans`).doc("plan-1").set({
      planId: "plan-1",
      title: "指図A",
      ownerUid: "owner_1",
      heirUids: ["heir_1"],
      heirs: [{ uid: "heir_1", email: "heir@example.com" }]
    });
    await db.collection(`cases/${caseId}/plans/plan-1/assets`).doc("plan-asset-1").set({
      planAssetId: "plan-asset-1",
      assetId: "asset-1",
      unitType: "PERCENT",
      allocations: [{ heirUid: "heir_1", value: 100 }]
    });
    await db.collection(`cases/${caseId}/assetLockItems`).doc("item-1").set({
      assetId: "asset-1",
      assetLabel: "Asset",
      token: null,
      plannedAmount: "100"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/distribution/execute`
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("NOT_READY");
    (globalThis as any).fetch = fetchOriginal;
  });

  it("creates distribution items when plan includes heirs even if status is DRAFT", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "tx") {
        return {
          ok: true,
          json: async () => ({
            result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } }
          })
        };
      }
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "1000000000", OwnerCount: 0 } }
          })
        };
      }
      if (body?.method === "server_state") {
        return {
          ok: true,
          json: async () => ({
            result: {
              state: { validated_ledger: { reserve_base: "1000000", reserve_inc: "200000" } }
            }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_distribution_single";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      status: "SUBMITTED",
      submittedTxHash: "tx-hash"
    });
    await db.collection(`cases/${caseId}/plans`).doc("plan-1").set({
      planId: "plan-1",
      title: "指図A",
      ownerUid: "owner_1",
      heirUids: ["heir_1"],
      heirs: [{ uid: "heir_1", email: "heir@example.com" }]
    });
    await db.collection(`cases/${caseId}/plans/plan-1/assets`).doc("plan-asset-1").set({
      planAssetId: "plan-asset-1",
      assetId: "asset-1",
      unitType: "PERCENT",
      allocations: [{ heirUid: "heir_1", value: 100 }]
    });
    await db.collection(`cases/${caseId}/assetLockItems`).doc("item-1").set({
      assetId: "asset-1",
      assetLabel: "Asset",
      token: null,
      plannedAmount: "100"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/distribution/execute`
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.status).toBe("COMPLETED");
    expect(res.body?.data?.totalCount).toBe(1);

    const stateSnap = await db.collection(`cases/${caseId}/distribution`).doc("state").get();
    expect(stateSnap.data()?.totalCount).toBe(1);
    const itemsSnap = await db
      .collection(`cases/${caseId}/distribution`)
      .doc("state")
      .collection("items")
      .get();
    expect(itemsSnap.docs.length).toBe(1);
    (globalThis as any).fetch = fetchOriginal;
  });

  it("scales down xrp distribution when balance is insufficient", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "tx") {
        return {
          ok: true,
          json: async () => ({
            result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } }
          })
        };
      }
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "50000000", OwnerCount: 1 } }
          })
        };
      }
      if (body?.method === "server_state") {
        return {
          ok: true,
          json: async () => ({
            result: {
              state: { validated_ledger: { reserve_base: "1000000", reserve_inc: "200000" } }
            }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_distribution_scale";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      status: "SUBMITTED",
      submittedTxHash: "tx-hash"
    });
    await db.collection(`cases/${caseId}/plans`).doc("plan-1").set({
      planId: "plan-1",
      title: "指図A",
      ownerUid: "owner_1",
      heirUids: ["heir_1"],
      heirs: [{ uid: "heir_1", email: "heir@example.com" }]
    });
    await db.collection(`cases/${caseId}/plans/plan-1/assets`).doc("plan-asset-1").set({
      planAssetId: "plan-asset-1",
      assetId: "asset-1",
      unitType: "PERCENT",
      allocations: [{ heirUid: "heir_1", value: 100 }]
    });
    await db.collection(`cases/${caseId}/assetLockItems`).doc("item-1").set({
      assetId: "asset-1",
      assetLabel: "Asset",
      token: null,
      plannedAmount: "100000000"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/distribution/execute`
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const itemsSnap = await db
      .collection(`cases/${caseId}/distribution`)
      .doc("state")
      .collection("items")
      .get();
    const item = itemsSnap.docs[0]?.data() ?? {};
    expect(Number(item.amount ?? "0")).toBeLessThan(100000000);
    (globalThis as any).fetch = fetchOriginal;
  });

  it("creates nft offers during distribution", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "tx") {
        return {
          ok: true,
          json: async () => ({
            result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } }
          })
        };
      }
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "1000000000", OwnerCount: 0 } }
          })
        };
      }
      if (body?.method === "server_state") {
        return {
          ok: true,
          json: async () => ({
            result: {
              state: { validated_ledger: { reserve_base: "1000000", reserve_inc: "200000" } }
            }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_distribution_nft";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      status: "SUBMITTED",
      submittedTxHash: "tx-hash"
    });
    await db.collection(`cases/${caseId}/assets`).doc("asset-1").set({
      label: "Asset",
      address: "rAsset",
      xrplSummary: {
        status: "ok",
        nfts: [{ tokenId: "nft-1", issuer: "rIssuer", uri: "https://example.com/nft/1" }]
      }
    });
    await db.collection(`cases/${caseId}/plans`).doc("plan-1").set({
      planId: "plan-1",
      title: "指図A",
      ownerUid: "owner_1",
      heirUids: ["heir_1"],
      heirs: [{ uid: "heir_1", email: "heir@example.com" }]
    });
    await db.collection(`cases/${caseId}/plans/plan-1/assets`).doc("plan-asset-1").set({
      planAssetId: "plan-asset-1",
      assetId: "asset-1",
      unitType: "PERCENT",
      allocations: [],
      nftAllocations: [{ tokenId: "nft-1", heirUid: "heir_1" }]
    });
    await db.collection(`cases/${caseId}/assetLockItems`).doc("item-1").set({
      assetId: "asset-1",
      assetLabel: "Asset",
      token: null,
      plannedAmount: "0"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/distribution/execute`
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const itemsSnap = await db
      .collection(`cases/${caseId}/distribution`)
      .doc("state")
      .collection("items")
      .get();
    const nftItems = itemsSnap.docs
      .map((doc) => doc.data())
      .filter((item) => item.type === "NFT");
    expect(nftItems.length).toBe(1);
    expect(nftItems[0]?.tokenId).toBe("nft-1");
    expect(nftItems[0]?.offerId).toBeDefined();
    (globalThis as any).fetch = fetchOriginal;
  });

  it("scales down xrp on retry when balance is insufficient", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "tx") {
        return {
          ok: true,
          json: async () => ({
            result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } }
          })
        };
      }
      if (body?.method === "account_info") {
        return {
          ok: true,
          json: async () => ({
            result: { account_data: { Balance: "50000000", OwnerCount: 1 } }
          })
        };
      }
      if (body?.method === "server_state") {
        return {
          ok: true,
          json: async () => ({
            result: {
              state: { validated_ledger: { reserve_base: "1000000", reserve_inc: "200000" } }
            }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_distribution_retry_scale";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      status: "SUBMITTED",
      submittedTxHash: "tx-hash"
    });
    await db.collection(`cases/${caseId}/distribution`).doc("state").set({
      status: "FAILED",
      totalCount: 1,
      successCount: 0,
      failedCount: 1,
      skippedCount: 0,
      escalationCount: 0,
      retryLimit: 3
    });
    await db.collection(`cases/${caseId}/distribution/state/items`).doc("item-1").set({
      status: "FAILED",
      planId: "plan-1",
      planTitle: "指図A",
      assetId: "asset-1",
      assetLabel: "Asset",
      heirUid: "heir-1",
      heirAddress: "rHeir",
      token: null,
      amount: "100000000",
      attempts: 1
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/distribution/execute`
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const itemSnap = await db
      .collection(`cases/${caseId}/distribution`)
      .doc("state")
      .collection("items")
      .doc("item-1")
      .get();
    expect(Number(itemSnap.data()?.amount ?? "0")).toBeLessThan(100000000);
    (globalThis as any).fetch = fetchOriginal;
  });

  it("skips items after retry limit and escalates", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body?.method === "tx") {
        return {
          ok: true,
          json: async () => ({
            result: { validated: true, meta: { TransactionResult: "tesSUCCESS" } }
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_distribution_retry";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      status: "SUBMITTED",
      submittedTxHash: "tx-hash"
    });

    const stateRef = db.collection(`cases/${caseId}/distribution`).doc("state");
    await stateRef.set({
      status: "RUNNING",
      retryLimit: 2,
      totalCount: 1,
      successCount: 0,
      failedCount: 1,
      skippedCount: 0,
      escalationCount: 0
    });
    await stateRef.collection("items").doc("item-1").set({
      status: "FAILED",
      attempts: 2,
      heirUid: "heir_1",
      heirAddress: "rHeir",
      token: null,
      amount: "100"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/distribution/execute`
    });
    const res = createRes();
    await handler(req as any, res as any);

    const itemSnap = await stateRef.collection("items").doc("item-1").get();
    expect(itemSnap.data()?.status).toBe("SKIPPED");
    const stateSnap = await stateRef.get();
    expect(stateSnap.data()?.escalationCount).toBe(1);
    (globalThis as any).fetch = fetchOriginal;
  });

  it("rejects prepare when heir wallets are unverified", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });
    process.env.XRPL_SYSTEM_SIGNER_ADDRESS = "rSystem";
    process.env.XRPL_SYSTEM_SIGNER_SEED = "sSystem";
    process.env.XRPL_VERIFY_ADDRESS = "rVerify";

    const db = getFirestore();
    const caseId = "case_approval_heir_unverified";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS",
      assetLockStatus: "LOCKED"
    });
    await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
      wallet: {
        address: "rLock",
        seedEncrypted: encryptPayload("sLock")
      }
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "PENDING"
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/signer-list/prepare`
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "heir_1", email: "heir@example.com" });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("HEIR_WALLET_UNVERIFIED");
  });

  it("allows heir to resubmit rejected death claim", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    const caseId = "case_1";
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"]
    });
    await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").set({
      submittedByUid: "heir_1",
      status: "ADMIN_REJECTED",
      adminReview: {
        status: "REJECTED",
        note: "差し戻し",
        reviewedByUid: "admin_1",
        reviewedAt: new Date("2024-01-01T00:00:00.000Z")
      },
      createdAt: new Date("2024-01-01T00:00:00.000Z")
    });
    await db.collection(`cases/${caseId}/deathClaims/claim_1/confirmations`).doc("heir_2").set({
      uid: "heir_2",
      createdAt: new Date("2024-01-01T00:00:00.000Z")
    });

    const req = authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/death-claims/claim_1/resubmit`
    });
    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    const claimSnap = await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").get();
    expect(claimSnap.data()?.status).toBe("SUBMITTED");
    expect(claimSnap.data()?.adminReview ?? null).toBeNull();
    const confirmationsSnap = await db
      .collection(`cases/${caseId}/deathClaims/claim_1/confirmations`)
      .get();
    expect(confirmationsSnap.docs.length).toBe(0);
  });

  it("confirms death after admin approve and majority consent", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1", "heir_2", "heir_3"],
      stage: "WAITING",
      assetLockStatus: "LOCKED",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").set({
      submittedByUid: "heir_1",
      status: "ADMIN_APPROVED",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const res1 = createRes();
    await handler(
      authedReq("heir_1", "heir1@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/death-claims/claim_1/confirm`
      }) as any,
      res1 as any
    );
    expect(res1.statusCode).toBe(200);

    const res2 = createRes();
    await handler(
      authedReq("heir_2", "heir2@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/death-claims/claim_1/confirm`
      }) as any,
      res2 as any
    );
    expect(res2.statusCode).toBe(200);

    const claimSnap = await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").get();
    expect(claimSnap.data()?.status).toBe("CONFIRMED");
  });

  it("lists submitted death claims for admin", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    await db.collection("cases").doc("case_1").set({ caseId: "case_1" });
    await db.collection("cases").doc("case_2").set({ caseId: "case_2" });
    await db.collection("cases/case_1/deathClaims").doc("claim_1").set({
      submittedByUid: "heir_1",
      status: "SUBMITTED",
      createdAt: new Date("2024-01-01T00:00:00.000Z")
    });
    await db.collection("cases/case_2/deathClaims").doc("claim_2").set({
      submittedByUid: "heir_2",
      status: "ADMIN_APPROVED",
      createdAt: new Date("2024-01-02T00:00:00.000Z")
    });

    const req = authedReq("admin_1", "admin@example.com", {
      method: "GET",
      path: "/v1/admin/death-claims",
      query: { status: "SUBMITTED" }
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "admin_1", email: "admin@example.com", admin: true });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.length).toBe(1);
    expect(res.body?.data?.[0]?.claimId).toBe("claim_1");
  });

  it("returns death claim detail for admin", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const db = getFirestore();
    await db.collection("cases").doc("case_1").set({
      caseId: "case_1",
      ownerDisplayName: "山田",
      stage: "WAITING",
      assetLockStatus: "LOCKED",
      memberUids: ["heir_1", "heir_2"],
      createdAt: new Date("2024-01-01T00:00:00.000Z")
    });
    await db.collection("cases/case_1/deathClaims").doc("claim_1").set({
      submittedByUid: "heir_1",
      status: "SUBMITTED",
      createdAt: new Date("2024-01-01T00:00:00.000Z")
    });
    await db
      .collection("cases/case_1/deathClaims/claim_1/files")
      .doc("file_1")
      .set({
        fileName: "death.pdf",
        contentType: "application/pdf",
        size: 1024,
        storagePath: "cases/case_1/death-claims/claim_1/file_1",
        uploadedByUid: "heir_1",
        createdAt: new Date("2024-01-02T00:00:00.000Z")
      });
    process.env.STORAGE_BUCKET = "kototsute.firebasestorage.app";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";

    const req = authedReq("admin_1", "admin@example.com", {
      method: "GET",
      path: "/v1/admin/death-claims/case_1/claim_1"
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "admin_1", email: "admin@example.com", admin: true });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.claim?.claimId).toBe("claim_1");
    expect(res.body?.data?.files?.length).toBe(1);
    expect(res.body?.data?.case?.ownerDisplayName).toBe("山田");
    expect(res.body?.data?.case?.memberCount).toBe(2);
    expect(res.body?.data?.files?.[0]?.storagePath).toContain("cases/case_1");
    expect(res.body?.data?.files?.[0]?.uploadedByUid).toBe("heir_1");
    expect(res.body?.data?.files?.[0]?.downloadUrl).toBe(
      "http://127.0.0.1:9199/v0/b/kototsute.firebasestorage.app/o/cases%2Fcase_1%2Fdeath-claims%2Fclaim_1%2Ffile_1?alt=media"
    );
    delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    delete process.env.STORAGE_BUCKET;
  });

  it("returns base64 file data for admin", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const claimId = "claim_1";
    const fileId = "file_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      ownerUid: "owner_1",
      memberUids: ["heir_1"]
    });
    await db.collection(`cases/${caseId}/deathClaims`).doc(claimId).set({
      status: "SUBMITTED",
      submittedByUid: "heir_1"
    });
    await db
      .collection(`cases/${caseId}/deathClaims/${claimId}/files`)
      .doc(fileId)
      .set({
        storagePath: `cases/${caseId}/death-claims/${claimId}/req_1`,
        fileName: "report.pdf",
        contentType: "application/pdf"
      });

    process.env.STORAGE_BUCKET = "kototsute.firebasestorage.app";

    const req = authedReq("admin_1", "admin@example.com", {
      method: "GET",
      path: `/v1/admin/death-claims/${caseId}/${claimId}/files/${fileId}/download`
    });
    const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
    authTokens.set(token, { uid: "admin_1", email: "admin@example.com", admin: true });

    const res = createRes();
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.fileName).toBe("report.pdf");
    expect(res.body?.data?.contentType).toBe("application/pdf");
    expect(res.body?.data?.dataBase64).toBe("ZHVtbXktZmlsZQ==");

    delete process.env.STORAGE_BUCKET;
  });

  it("returns signer list status and counts", async () => {
    process.env.XRPL_SYSTEM_SIGNER_ADDRESS = "rSystem";
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1", "heir_2"],
      stage: "IN_PROGRESS",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await db.collection(`cases/${caseId}/signerList`).doc("state").set({
      status: "SET",
      quorum: 2,
      entries: [{ account: "rSystem", weight: 2 }],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db
      .collection(`cases/${caseId}/signerList/state/signatures`)
      .doc("heir_1")
      .set({ uid: "heir_1", address: "rHeir", txHash: "tx1", createdAt: new Date() });

    const res = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/signer-list`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.status).toBe("SET");
    expect(res.body?.data?.signaturesCount).toBe(1);
    expect(res.body?.data?.requiredCount).toBe(2);
    expect(res.body?.data?.signedByMe).toBe(true);
    expect(res.body?.data?.entries).toEqual([{ account: "rSystem", weight: 2 }]);
    expect(res.body?.data?.systemSignerAddress).toBe("rSystem");
  });

  it("returns approval tx for heir", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_approval";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      memo: "memo_abc",
      txJson: { TransactionType: "Payment", Account: "rLock" },
      status: "PREPARED"
    });

    const res = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/signer-list/approval-tx`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.memo).toBe("memo_abc");
  });

  it("returns approval tx verification status when submitted", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          validated: true,
          meta: { TransactionResult: "tesSUCCESS" }
        }
      })
    }));
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_submitted";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      memo: "memo_abc",
      txJson: { TransactionType: "Payment", Account: "rLock" },
      status: "SUBMITTED",
      submittedTxHash: "tx_hash_1"
    });

    const res = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/signer-list/approval-tx`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.submittedTxHash).toBe("tx_hash_1");
    expect(res.body?.data?.networkStatus).toBe("VALIDATED");
    expect(res.body?.data?.networkResult).toBe("tesSUCCESS");

    (globalThis as any).fetch = fetchOriginal;
  });

  it("returns approval tx expired status when last ledger is passed", async () => {
    const fetchOriginal = (globalThis as any).fetch;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { validated: false, LastLedgerSequence: 10 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { state: { validated_ledger: { seq: 20 } } }
        })
      });
    (globalThis as any).fetch = fetchMock;

    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_submitted_expired";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1"],
      stage: "IN_PROGRESS"
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      memo: "memo_abc",
      txJson: { TransactionType: "Payment", Account: "rLock" },
      status: "SUBMITTED",
      submittedTxHash: "tx_hash_2"
    });

    const res = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "GET",
        path: `/v1/cases/${caseId}/signer-list/approval-tx`
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.networkStatus).toBe("EXPIRED");

    (globalThis as any).fetch = fetchOriginal;
  });

  it("accepts signed blob and records signature", async () => {
    const handler = createApiHandler({
      repo: new InMemoryAssetRepository(),
      caseRepo: new InMemoryCaseRepository(),
      now: () => new Date("2024-01-01T00:00:00.000Z"),
      getAuthUser,
      getOwnerUidForRead: async (uid) => uid
    });

    const caseId = "case_1";
    const db = getFirestore();
    await db.collection("cases").doc(caseId).set({
      caseId,
      ownerUid: "owner_1",
      memberUids: ["owner_1", "heir_1", "heir_2"],
      stage: "IN_PROGRESS",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection(`cases/${caseId}/signerList`).doc("state").set({
      status: "SET",
      quorum: 2,
      entries: [{ account: "rSystem", weight: 2 }],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
      memo: "memo_abc",
      txJson: { TransactionType: "Payment", Account: "rLock" },
      systemSignedBlob: "blob-system",
      status: "PREPARED"
    });
    await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
      address: "rHeir",
      verificationStatus: "VERIFIED"
    });

    const res = createRes();
    await handler(
      authedReq("heir_1", "heir@example.com", {
        method: "POST",
        path: `/v1/cases/${caseId}/signer-list/sign`,
        body: { signedBlob: "blob-heir" }
      }) as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.signaturesCount).toBe(1);
    const sigSnap = await db
      .collection(`cases/${caseId}/signerList/state/signatures`)
      .doc("heir_1")
      .get();
    expect(sigSnap.data()?.signedBlob).toBe("blob-heir");
  });
});
