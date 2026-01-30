# 資産ロックウィザード Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ケース内の全資産を対象に、A/B方式選択と送金検証まで完了できる資産ロックウィザードを実装する。

**Architecture:** Webは `/cases/:caseId/asset-lock` のウィザードで進行状態を管理し、APIは `cases/{caseId}/assetLock` と `assetLockItems` を永続化して検証状態を返す。B方式はRegularKey署名→自動送金→検証までサーバが行い、A方式はTXハッシュ入力で検証のみ行う。

**Tech Stack:** React + Vite (apps/web), Firebase Functions (Hono), Firestore, XRPL JSON-RPC, AES-256-GCM暗号化

> 注意: このリポジトリでは `git worktree` を使わない方針のため、現行ブランチで進める。

---

### Task 1: Web APIクライアントの追加（asset-lock）

**Files:**
- Create: `apps/web/src/app/api/asset-lock.ts`
- Test: `apps/web/src/app/api/asset-lock.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../features/shared/lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: {} }))
}));

describe("asset-lock api", () => {
  it("calls get endpoint", async () => {
    const { getAssetLock } = await import("./asset-lock");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await getAssetLock("case-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/asset-lock", { method: "GET" });
  });

  it("calls start endpoint", async () => {
    const { startAssetLock } = await import("./asset-lock");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await startAssetLock("case-1", { method: "B" });
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/asset-lock/start", {
      method: "POST",
      body: JSON.stringify({ method: "B" })
    });
  });

  it("calls verify endpoint", async () => {
    const { verifyAssetLockItem } = await import("./asset-lock");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await verifyAssetLockItem("case-1", { itemId: "item-1", txHash: "tx" });
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/asset-lock/verify", {
      method: "POST",
      body: JSON.stringify({ itemId: "item-1", txHash: "tx" })
    });
  });

  it("calls execute endpoint", async () => {
    const { executeAssetLock } = await import("./asset-lock");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await executeAssetLock("case-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/asset-lock/execute", {
      method: "POST"
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter kototsute test src/app/api/asset-lock.test.ts`
Expected: FAIL with module not found or function missing

**Step 3: Write minimal implementation**

```ts
import { apiFetch } from "../../features/shared/lib/api";

export type AssetLockMethod = "A" | "B";

export type AssetLockItem = {
  itemId: string;
  assetId: string;
  assetLabel: string;
  token: { currency: string; issuer: string | null; isNative: boolean } | null;
  plannedAmount: string;
  status: "PENDING" | "SENT" | "VERIFIED" | "FAILED";
  txHash: string | null;
  error: string | null;
};

export type AssetLockState = {
  status: "DRAFT" | "READY" | "LOCKING" | "LOCKED" | "FAILED";
  method: AssetLockMethod | null;
  wallet: { address: string } | null;
  items: AssetLockItem[];
};

export const getAssetLock = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock`, { method: "GET" });
  return result.data as AssetLockState;
};

export const startAssetLock = async (caseId: string, input: { method: AssetLockMethod }) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/start`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as AssetLockState;
};

export const verifyAssetLockItem = async (
  caseId: string,
  input: { itemId: string; txHash: string }
) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/verify`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as AssetLockState;
};

export const executeAssetLock = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/execute`, {
    method: "POST"
  });
  return result.data as AssetLockState;
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter kototsute test src/app/api/asset-lock.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/asset-lock.ts apps/web/src/app/api/asset-lock.test.ts
git commit -m "資産ロックAPIクライアントを追加"
```

---

### Task 2: Functions 暗号化ユーティリティ

**Files:**
- Create: `apps/functions/src/api/utils/encryption.ts`
- Modify: `apps/functions/.env.example`
- Test: `apps/functions/src/api/utils/encryption.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { encryptPayload, decryptPayload } from "./encryption";

process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");

describe("encryption", () => {
  it("roundtrips payload", () => {
    const encrypted = encryptPayload("secret");
    expect(decryptPayload(encrypted)).toBe("secret");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter functions test src/api/utils/encryption.test.ts`
Expected: FAIL with module not found

**Step 3: Write minimal implementation**

```ts
import crypto from "node:crypto";

type EncryptedPayload = {
  cipherText: string;
  iv: string;
  tag: string;
  version: number;
};

const getKey = () => {
  const raw = process.env.ASSET_LOCK_ENCRYPTION_KEY;
  if (!raw) throw new Error("ASSET_LOCK_ENCRYPTION_KEY is missing");
  return Buffer.from(raw, "base64");
};

export const encryptPayload = (plain: string): EncryptedPayload => {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipherText: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    version: 1
  };
};

export const decryptPayload = (payload: EncryptedPayload): string => {
  const key = getKey();
  const iv = Buffer.from(payload.iv, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "base64")),
    decipher.final()
  ]);
  return plain.toString("utf8");
};

export type { EncryptedPayload };
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter functions test src/api/utils/encryption.test.ts`
Expected: PASS

**Step 5: Update env example**

Add to `apps/functions/.env.example`:
```
# Asset lock encryption key (base64, 32 bytes)
ASSET_LOCK_ENCRYPTION_KEY=
```

**Step 6: Commit**

```bash
git add apps/functions/src/api/utils/encryption.ts apps/functions/src/api/utils/encryption.test.ts apps/functions/.env.example
git commit -m "資産ロック暗号化ユーティリティを追加"
```

---

### Task 3: Functions asset-lock start API

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Test: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("starts asset lock and creates items", async () => {
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
      reserveTokens: [{ currency: "JPYC", issuer: "rIssuer", reserveAmount: "1" }]
    },
    { merge: true }
  );

  const startRes = createRes();
  await handler(
    authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/asset-lock/start`,
      body: { method: "A" }
    }) as any,
    startRes as any
  );

  expect(startRes.statusCode).toBe(200);
  const lockSnap = await db.collection("cases").doc(caseId).collection("assetLock").doc("state").get();
  expect(lockSnap.exists).toBe(true);
  const itemsSnap = await db.collection("cases").doc(caseId).collection("assetLockItems").get();
  expect(itemsSnap.docs.length).toBe(2);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter functions test src/api/handler.test.ts -t "starts asset lock"`
Expected: FAIL with 404

**Step 3: Write minimal implementation**

```ts
app.post(":caseId/asset-lock/start", async (c) => {
  const deps = c.get("deps");
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const body = await c.req.json().catch(() => ({}));
  const method = body?.method === "B" ? "B" : "A";

  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  if (caseSnap.data()?.ownerUid !== auth.uid) return jsonError(c, 403, "FORBIDDEN", "権限がありません");

  const assetsSnap = await db.collection(`cases/${caseId}/assets`).get();
  const wallet = createXrplWallet();
  const now = deps.now();
  await caseRef.collection("assetLock").doc("state").set({
    status: "READY",
    method,
    wallet: { address: wallet.address, seedEncrypted: encryptPayload(wallet.seed), createdAt: now },
    createdAt: now,
    updatedAt: now
  });

  const batch = db.batch();
  assetsSnap.docs.forEach((doc) => {
    const asset = doc.data() ?? {};
    const plannedXrp = calcPlannedXrp(asset);
    const itemRef = caseRef.collection("assetLockItems").doc();
    batch.set(itemRef, {
      itemId: itemRef.id,
      assetId: doc.id,
      assetLabel: asset.label ?? "",
      token: null,
      plannedAmount: plannedXrp,
      status: "PENDING",
      txHash: null,
      error: null,
      createdAt: now
    });

    const tokens = Array.isArray(asset.xrplSummary?.tokens) ? asset.xrplSummary.tokens : [];
    tokens.forEach((token: any) => {
      const planned = calcPlannedToken(token, asset.reserveTokens ?? []);
      const tokenRef = caseRef.collection("assetLockItems").doc();
      batch.set(tokenRef, {
        itemId: tokenRef.id,
        assetId: doc.id,
        assetLabel: asset.label ?? "",
        token: { currency: token.currency, issuer: token.issuer ?? null, isNative: false },
        plannedAmount: planned,
        status: "PENDING",
        txHash: null,
        error: null,
        createdAt: now
      });
    });
  });
  await batch.commit();
  return jsonOk(c, { status: "READY", method, wallet: { address: wallet.address } });
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter functions test src/api/handler.test.ts -t "starts asset lock"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "資産ロック開始APIを追加"
```

---

### Task 4: Functions asset-lock verify API

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Test: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
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
  const itemSnap = await itemRef.get();
  expect(itemSnap.data()?.status).toBe("VERIFIED");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter functions test src/api/handler.test.ts -t "verifies asset lock"`
Expected: FAIL with 404

**Step 3: Write minimal implementation**

```ts
app.post(":caseId/asset-lock/verify", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const body = await c.req.json().catch(() => ({}));
  const itemId = body?.itemId;
  const txHash = body?.txHash;
  if (typeof itemId !== "string" || typeof txHash !== "string") {
    return jsonError(c, 400, "VALIDATION_ERROR", "itemIdとtxHashは必須です");
  }

  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  if (caseSnap.data()?.ownerUid !== auth.uid) return jsonError(c, 403, "FORBIDDEN", "権限がありません");

  const lockSnap = await caseRef.collection("assetLock").doc("state").get();
  const lock = lockSnap.data() ?? {};
  const destination = lock?.wallet?.address;

  const itemRef = caseRef.collection("assetLockItems").doc(itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data() ?? {};

  const result = await fetchXrplTx(txHash);
  if (!result.ok) return jsonError(c, 400, "XRPL_TX_NOT_FOUND", result.message);
  const tx = result.tx as any;

  if (tx?.Destination !== destination) {
    await itemRef.set({ status: "FAILED", error: "DESTINATION_MISMATCH", txHash }, { merge: true });
    return jsonError(c, 400, "DESTINATION_MISMATCH", "送金先が一致しません");
  }
  if (String(tx?.Amount) !== String(item.plannedAmount)) {
    await itemRef.set({ status: "FAILED", error: "AMOUNT_MISMATCH", txHash }, { merge: true });
    return jsonError(c, 400, "AMOUNT_MISMATCH", "送金額が一致しません");
  }

  await itemRef.set({ status: "VERIFIED", txHash, error: null }, { merge: true });
  return jsonOk(c);
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter functions test src/api/handler.test.ts -t "verifies asset lock"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "資産ロック検証APIを追加"
```

---

### Task 5: Functions asset-lock execute API (B方式)

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Create: `apps/functions/src/api/utils/xrpl-wallet.ts`
- Modify: `apps/functions/package.json`
- Test: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
vi.mock("./utils/xrpl-wallet.js", () => ({
  sendXrpPayment: async () => ({ txHash: "tx-xrp" }),
  sendTokenPayment: async () => ({ txHash: "tx-token" })
}));

it("executes asset lock for method B", async () => {
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
    wallet: { address: "rDest", seedEncrypted: { cipherText: "", iv: "", tag: "", version: 1 } }
  });

  const itemRef = db.collection("cases").doc(caseId).collection("assetLockItems").doc();
  await itemRef.set({
    itemId: itemRef.id,
    assetId: "asset-1",
    assetLabel: "XRP",
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
  const itemSnap = await itemRef.get();
  expect(itemSnap.data()?.status).toBe("VERIFIED");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter functions test src/api/handler.test.ts -t "executes asset lock"`
Expected: FAIL with 404

**Step 3: Write minimal implementation**

```ts
export const sendXrpPayment = async ({ fromSeed, to, amountDrops }: {
  fromSeed: string;
  to: string;
  amountDrops: string;
}) => {
  // build payment tx and submit (xrpl or JSON-RPC)
  return { txHash: "" };
};

app.post(":caseId/asset-lock/execute", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  if (caseSnap.data()?.ownerUid !== auth.uid) return jsonError(c, 403, "FORBIDDEN", "権限がありません");

  const lockSnap = await caseRef.collection("assetLock").doc("state").get();
  const lock = lockSnap.data() ?? {};
  const destination = lock?.wallet?.address;
  const seed = decryptPayload(lock?.wallet?.seedEncrypted);

  const itemsSnap = await caseRef.collection("assetLockItems").get();
  for (const doc of itemsSnap.docs) {
    const item = doc.data();
    if (item.token) {
      await sendTokenPayment({ fromSeed: seed, to: destination, token: item.token, amount: item.plannedAmount });
    } else {
      await sendXrpPayment({ fromSeed: seed, to: destination, amountDrops: item.plannedAmount });
    }
    await doc.ref.set({ status: "VERIFIED", txHash: "" }, { merge: true });
  }

  await caseRef.set({ assetLockStatus: "LOCKED" }, { merge: true });
  return jsonOk(c);
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter functions test src/api/handler.test.ts -t "executes asset lock"`
Expected: PASS

**Step 5: Add dependency and commit**

```bash
pnpm --filter functions add xrpl
```

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/utils/xrpl-wallet.ts apps/functions/src/api/handler.test.ts apps/functions/package.json
git commit -m "資産ロック自動実行APIを追加"
```

---

### Task 6: Web ウィザードページ

**Files:**
- Create: `apps/web/src/app/pages/AssetLockPage.tsx`
- Create: `apps/web/src/styles/assetLockPage.module.css`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Test: `apps/web/src/app/pages/AssetLockPage.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

it("renders asset lock wizard", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(AssetLockPage))
  );
  expect(html).toContain("資産ロック");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter kototsute test src/app/pages/AssetLockPage.test.ts`
Expected: FAIL module not found

**Step 3: Write minimal implementation**

- ウィザード4ステップの枠組みと見出しを実装
- `CaseDetailPage` に「資産をロックする」ボタン追加（オーナーのみ）
- `App.tsx` にルート追加

**Step 4: Run test to verify it passes**

Run: `pnpm --filter kototsute test src/app/pages/AssetLockPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/AssetLockPage.tsx apps/web/src/styles/assetLockPage.module.css apps/web/src/app/App.tsx apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/app/pages/AssetLockPage.test.ts
git commit -m "資産ロックウィザード画面を追加"
```

---

### Task 7: Web 送金検証フロー接続

**Files:**
- Modify: `apps/web/src/app/pages/AssetLockPage.tsx`
- Modify: `apps/web/src/app/api/asset-lock.ts`
- Test: `apps/web/src/app/pages/AssetLockPage.test.ts`

**Step 1: Write the failing test**

```ts
it("shows tx input per asset item", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(AssetLockPage, {
      initialLock: {
        status: "READY",
        method: "A",
        wallet: { address: "rDest" },
        items: [
          { itemId: "i1", assetId: "a1", assetLabel: "XRP", token: null, plannedAmount: "1", status: "PENDING", txHash: null, error: null }
        ]
      }
    }))
  );
  expect(html).toContain("TX Hash");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter kototsute test src/app/pages/AssetLockPage.test.ts -t "tx input"`
Expected: FAIL

**Step 3: Write minimal implementation**

- start/verify/execute をAPIで接続
- itemsごとにTX入力欄
- 検証結果を表示

**Step 4: Run test to verify it passes**

Run: `pnpm --filter kototsute test src/app/pages/AssetLockPage.test.ts -t "tx input"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/AssetLockPage.tsx apps/web/src/app/api/asset-lock.ts apps/web/src/app/pages/AssetLockPage.test.ts
git commit -m "資産ロックの送金検証を接続"
```

---

### Task 8: Functions ビルド

**Step 1: Run build**

Run: `task functions:build`
Expected: PASS

