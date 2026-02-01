# 相続実行 MultiSign 承認Tx Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 相続実行の承認Tx（Payment 1 drop）を MultiSign で集約・送信し、相続人/被相続人の検証送金もアプリ内で完結できるようにする。

**Architecture:** Functions が承認Txを自動生成しシステム署名を保持、相続人は署名済みtx blobを提出、サーバーが署名を集約して submit_multisigned を実行する。Web は署名対象Txの表示・コピー・署名ガイド、アプリ内署名/送金を提供する。Admin は承認Tx生成のトリガーUIを持つ。

**Tech Stack:** Firebase Functions (Hono), Firestore, xrpl JS SDK, React/Vite, Vitest

---

### Task 1: Functions - 承認Tx生成（Admin）APIのテスト追加

**Files:**
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("prepares approval tx for admin", async () => {
  const caseId = "case_1";
  const adminHeader = registerAuth("admin_1", "admin@example.com");
  authTokens.set(adminHeader.replace("Bearer ", ""), { uid: "admin_1", email: "admin@example.com", admin: true });

  const db = getFirestore();
  await db.collection("cases").doc(caseId).set({
    ownerUid: "owner_1",
    stage: "IN_PROGRESS",
    memberUids: ["owner_1", "heir_1"],
    assetLockStatus: "LOCKED"
  });
  await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
    wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
  });
  await db.collection(`cases/${caseId}/signerList`).doc("state").set({
    status: "SET",
    quorum: 2,
    entries: [{ account: "rSystem", weight: 1 }, { account: "rHeir", weight: 1 }]
  });

  const res = await request({
    method: "POST",
    path: `/v1/admin/cases/${caseId}/signer-list/prepare`,
    headers: { Authorization: adminHeader }
  });

  expect(res.statusCode).toBe(200);
  const approvalSnap = await db
    .collection(`cases/${caseId}/signerList`)
    .doc("approvalTx")
    .get();
  expect(approvalSnap.exists).toBe(true);
  expect(approvalSnap.data()?.memo).toBe("memo_123");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "prepares approval tx"`
Expected: FAIL (route not found or memo mismatch)

---

### Task 2: Functions - 承認Tx生成（Admin）APIの実装

**Files:**
- Create: `apps/functions/src/api/utils/xrpl-multisign.ts`
- Modify: `apps/functions/src/api/routes/admin.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Implement minimal util**

```ts
// apps/functions/src/api/utils/xrpl-multisign.ts
import { Client, Wallet } from "xrpl";
import { resolveXrplWsUrl } from "@kototsute/shared";

const getXrplWsUrl = () =>
  resolveXrplWsUrl(process.env.XRPL_WS_URL ?? process.env.XRPL_URL ?? "https://s.altnet.rippletest.net:51234");

export const prepareApprovalTx = async (input: {
  fromAddress: string;
  destination: string;
  amountDrops: string;
  memoHex: string;
  signersCount: number;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const tx = await client.autofill(
      {
        TransactionType: "Payment",
        Account: input.fromAddress,
        Destination: input.destination,
        Amount: input.amountDrops,
        Memos: [{ Memo: { MemoData: input.memoHex } }]
      },
      input.signersCount
    );
    return tx;
  } finally {
    await client.disconnect();
  }
};

export const signForMultisign = (tx: any, seed: string) => {
  const wallet = Wallet.fromSeed(seed);
  const signed = wallet.sign(tx, true);
  return { blob: signed.tx_blob, hash: signed.hash ?? "" };
};
```

**Step 2: Implement admin route**

```ts
// apps/functions/src/api/routes/admin.ts
import { createChallenge } from "../utils/xrpl.js";
import { decryptPayload } from "../utils/encryption.js";
import { prepareApprovalTx, signForMultisign } from "../utils/xrpl-multisign.js";

app.post("/cases/:caseId/signer-list/prepare", async (c) => {
  const auth = c.get("auth");
  if (!auth.admin) return jsonError(c, 403, "FORBIDDEN", "権限がありません");

  const caseId = c.req.param("caseId");
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  if (caseSnap.data()?.stage !== "IN_PROGRESS") {
    return jsonError(c, 400, "NOT_READY", "相続中のみ生成できます");
  }

  const signerRef = caseRef.collection("signerList").doc("state");
  const signerSnap = await signerRef.get();
  if (!signerSnap.exists || signerSnap.data()?.status !== "SET") {
    return jsonError(c, 400, "SIGNER_LIST_NOT_READY", "署名準備が完了していません");
  }

  const lockSnap = await caseRef.collection("assetLock").doc("state").get();
  const lockData = lockSnap.data() ?? {};
  const walletAddress = lockData?.wallet?.address;
  const seedEncrypted = lockData?.wallet?.seedEncrypted;
  if (!walletAddress || !seedEncrypted) {
    return jsonError(c, 400, "VALIDATION_ERROR", "分配用Walletが未設定です");
  }

  const memo = createChallenge();
  const memoHex = Buffer.from(memo, "utf8").toString("hex").toUpperCase();
  const entries = Array.isArray(signerSnap.data()?.entries) ? signerSnap.data()?.entries : [];
  const signersCount = entries.length || 1;

  const txJson = await prepareApprovalTx({
    fromAddress: walletAddress,
    destination: process.env.XRPL_VERIFY_ADDRESS ?? "",
    amountDrops: "1",
    memoHex,
    signersCount
  });

  const systemSeed = process.env.XRPL_SYSTEM_SIGNER_SEED ?? "";
  if (!systemSeed) {
    return jsonError(c, 500, "SYSTEM_SIGNER_MISSING", "システム署名が未設定です");
  }
  const systemSigned = signForMultisign(txJson, systemSeed);

  await caseRef.collection("signerList").doc("approvalTx").set({
    memo,
    txJson,
    systemSignedBlob: systemSigned.blob,
    systemSignedHash: systemSigned.hash,
    status: "PREPARED",
    submittedTxHash: null,
    createdAt: c.get("deps").now(),
    updatedAt: c.get("deps").now()
  });

  return jsonOk(c, {
    memo,
    fromAddress: walletAddress,
    destination: process.env.XRPL_VERIFY_ADDRESS ?? "",
    amountDrops: "1"
  });
});
```

**Step 3: Update test mocks**

```ts
// apps/functions/src/api/handler.test.ts
vi.mock("./utils/xrpl-multisign", () => ({
  prepareApprovalTx: async () => ({ TransactionType: "Payment", Account: "rLock" }),
  signForMultisign: () => ({ blob: "blob-system", hash: "hash-system" })
}));

vi.mock("./utils/xrpl", async () => {
  const actual = await vi.importActual<any>("./utils/xrpl");
  return { ...actual, createChallenge: () => "memo_123" };
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "prepares approval tx"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/utils/xrpl-multisign.ts apps/functions/src/api/routes/admin.ts apps/functions/src/api/handler.test.ts
git commit -m "相続実行承認Tx生成APIを追加"
```

**Step 6: Build Functions**

Run: `task functions:build`

---

### Task 3: Functions - 署名対象Tx取得API + 署名提出API（signed blob）

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`
- Modify: `apps/functions/src/api/utils/xrpl-multisign.ts`

**Step 1: Write failing tests**

```ts
it("returns approval tx for heir", async () => {
  const caseId = "case_2";
  const heirHeader = registerAuth("heir_1", "heir@example.com");
  const db = getFirestore();
  await db.collection("cases").doc(caseId).set({
    ownerUid: "owner_1",
    stage: "IN_PROGRESS",
    memberUids: ["owner_1", "heir_1"]
  });
  await db.collection(`cases/${caseId}/signerList`).doc("approvalTx").set({
    memo: "memo_abc",
    txJson: { TransactionType: "Payment", Account: "rLock" },
    status: "PREPARED"
  });

  const res = await request({
    method: "GET",
    path: `/v1/cases/${caseId}/signer-list/approval-tx`,
    headers: { Authorization: heirHeader }
  });

  expect(res.statusCode).toBe(200);
  expect(res.body.data.memo).toBe("memo_abc");
});

it("accepts signed blob and stores signature", async () => {
  const caseId = "case_3";
  const heirHeader = registerAuth("heir_1", "heir@example.com");
  const db = getFirestore();
  await db.collection("cases").doc(caseId).set({
    ownerUid: "owner_1",
    stage: "IN_PROGRESS",
    memberUids: ["owner_1", "heir_1"]
  });
  await db.collection(`cases/${caseId}/signerList`).doc("state").set({ status: "SET" });
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

  const res = await request({
    method: "POST",
    path: `/v1/cases/${caseId}/signer-list/sign`,
    headers: { Authorization: heirHeader },
    body: { signedBlob: "blob-heir" }
  });

  expect(res.statusCode).toBe(200);
  const sigSnap = await db
    .collection(`cases/${caseId}/signerList/state/signatures`)
    .doc("heir_1")
    .get();
  expect(sigSnap.exists).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "approval tx"`
Expected: FAIL

**Step 3: Implement routes + validation helpers**

```ts
// apps/functions/src/api/utils/xrpl-multisign.ts
import { decode, hashes } from "xrpl";
import { multisign } from "xrpl";
import { Client } from "xrpl";

export const decodeSignedBlob = (blob: string) => decode(blob);
export const hashSignedBlob = (blob: string) => hashes.hashSignedTx(blob);

export const combineMultisignedBlobs = (blobs: string[]) => {
  const combined = multisign(blobs);
  return { blob: combined, txJson: decode(combined) };
};

export const submitMultisignedTx = async (txJson: any) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const response = await client.request({ command: "submit_multisigned", tx_json: txJson });
    return { txHash: response.result?.hash ?? response.result?.tx_json?.hash ?? "" };
  } finally {
    await client.disconnect();
  }
};
```

```ts
// apps/functions/src/api/routes/cases.ts
app.get(":caseId/signer-list/approval-tx", async (c) => {
  // 相続人権限チェック
  // approvalTx を返却（memo, txJson, status, systemSignedHash など）
});

app.post(":caseId/signer-list/sign", async (c) => {
  const signedBlob = typeof body?.signedBlob === "string" ? body.signedBlob.trim() : "";
  if (!signedBlob) return jsonError(c, 400, "VALIDATION_ERROR", "signedBlobは必須です");

  // 署名対象Txの取得
  // decodeSignedBlob で tx を取得
  // Account/Destination/Amount/Memo/Sequence などを approvalTx.txJson と照合
  // Signers[].Signer.Account が相続人ウォレットと一致することを検証

  // signatures に保存

  // requiredCount 到達なら
  // combineMultisignedBlobs([systemSignedBlob, ...heirSignedBlobs])
  // submitMultisignedTx
  // approvalTx.status = SUBMITTED, submittedTxHash を保存
});
```

**Step 4: Update test mocks**

```ts
// apps/functions/src/api/handler.test.ts
vi.mock("./utils/xrpl-multisign", () => ({
  prepareApprovalTx: async () => ({ TransactionType: "Payment", Account: "rLock" }),
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
  combineMultisignedBlobs: () => ({ blob: "blob-combined", txJson: { TransactionType: "Payment" } }),
  submitMultisignedTx: async () => ({ txHash: "tx-final" })
}));
```

**Step 5: Run tests to verify they pass**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "approval tx"`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/utils/xrpl-multisign.ts apps/functions/src/api/handler.test.ts
git commit -m "相続実行の署名取得と提出APIを追加"
```

**Step 7: Build Functions**

Run: `task functions:build`

---

### Task 4: Admin - 承認Tx生成UI/Client追加

**Files:**
- Create: `apps/admin/src/api/signer-list.ts`
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`
- Modify: `apps/admin/src/pages/claim-status.test.ts`

**Step 1: Write failing test**

```ts
// apps/admin/src/pages/claim-status.test.ts
it("shows approval tx action label", () => {
  expect(toClaimStatusLabel("CONFIRMED")).toBe("死亡確定");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/admin test -- claim-status.test.ts`
Expected: FAIL (if needed adjustments for new label)

**Step 3: Implement API client**

```ts
// apps/admin/src/api/signer-list.ts
import { apiFetch } from "./api";

export const prepareApprovalTx = async (caseId: string) => {
  const result = await apiFetch(`/v1/admin/cases/${caseId}/signer-list/prepare`, { method: "POST" });
  return result.data as { memo: string; fromAddress: string; destination: string; amountDrops: string };
};
```

**Step 4: Update ClaimDetailPage UI**

```tsx
// apps/admin/src/pages/ClaimDetailPage.tsx
// 既存の死亡診断書ステータス表示付近に、CONFIRMED の場合のみ表示
// 「相続実行Txを生成」ボタン + 生成後の memo/送金先/金額 表示 + コピー
```

**Step 5: Run admin tests**

Run: `pnpm -C apps/admin test -- claim-status.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/admin/src/api/signer-list.ts apps/admin/src/pages/ClaimDetailPage.tsx apps/admin/src/pages/claim-status.test.ts
git commit -m "管理画面に相続実行Tx生成を追加"
```

---

### Task 5: Web API - approval tx 取得と署名送信の更新

**Files:**
- Modify: `apps/web/src/app/api/signer-list.ts`
- Modify: `apps/web/src/app/api/signer-list.test.ts`

**Step 1: Write failing tests**

```ts
it("fetches approval tx", async () => {
  await getApprovalTx("case-1");
  expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/signer-list/approval-tx", { method: "GET" });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web test -- src/app/api/signer-list.test.ts`
Expected: FAIL

**Step 3: Implement API client**

```ts
export const getApprovalTx = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list/approval-tx`, { method: "GET" });
  return result.data as { memo: string; txJson: Record<string, any>; status: string };
};

export const submitSignerSignature = async (caseId: string, signedBlob: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list/sign`, {
    method: "POST",
    body: JSON.stringify({ signedBlob })
  });
  return result.data as { signaturesCount: number; requiredCount: number; signedByMe: boolean };
};
```

**Step 4: Run tests**

Run: `pnpm -C apps/web test -- src/app/api/signer-list.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/signer-list.ts apps/web/src/app/api/signer-list.test.ts
git commit -m "相続実行承認TxのAPIクライアントを追加"
```

---

### Task 6: Web - XRPL 署名/送金ヘルパー追加

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/features/xrpl/xrpl-client.ts`
- Create: `apps/web/src/features/xrpl/xrpl-client.test.ts`

**Step 1: Write failing test**

```ts
import { createPaymentTx } from "./xrpl-client";

test("builds payment tx", async () => {
  const tx = await createPaymentTx({ from: "rFrom", to: "rTo", amountDrops: "1", memoHex: "AB" });
  expect(tx.TransactionType).toBe("Payment");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- src/features/xrpl/xrpl-client.test.ts`
Expected: FAIL

**Step 3: Implement helper**

```ts
// apps/web/src/features/xrpl/xrpl-client.ts
import { Client, Wallet, hashes } from "xrpl";

const resolveWsUrl = () =>
  import.meta.env.VITE_XRPL_WS_URL ?? "wss://s.altnet.rippletest.net:51233";

export const createPaymentTx = async (input: {
  from: string;
  to: string;
  amountDrops: string;
  memoHex?: string;
  signersCount?: number;
}) => {
  const client = new Client(resolveWsUrl());
  await client.connect();
  try {
    const tx = await client.autofill(
      {
        TransactionType: "Payment",
        Account: input.from,
        Destination: input.to,
        Amount: input.amountDrops,
        ...(input.memoHex ? { Memos: [{ Memo: { MemoData: input.memoHex } }] } : {})
      },
      input.signersCount
    );
    return tx;
  } finally {
    await client.disconnect();
  }
};

export const signForMultisign = (tx: any, seed: string) => {
  const wallet = Wallet.fromSeed(seed);
  const signed = wallet.sign(tx, true);
  return { blob: signed.tx_blob, hash: signed.hash ?? "" };
};

export const signSingle = (tx: any, seed: string) => {
  const wallet = Wallet.fromSeed(seed);
  const signed = wallet.sign(tx);
  return { blob: signed.tx_blob, hash: signed.hash ?? "" };
};

export const submitSignedBlob = async (blob: string) => {
  const client = new Client(resolveWsUrl());
  await client.connect();
  try {
    const res = await client.submit(blob);
    return { txHash: hashes.hashSignedTx(blob), engineResult: res.result?.engine_result };
  } finally {
    await client.disconnect();
  }
};
```

**Step 4: Run tests**

Run: `pnpm -C apps/web test -- src/features/xrpl/xrpl-client.test.ts`
Expected: PASS (with mocks)

**Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/features/xrpl/xrpl-client.ts apps/web/src/features/xrpl/xrpl-client.test.ts
git commit -m "XRPL署名と送金ヘルパーを追加"
```

---

### Task 7: Web - 相続実行タブに署名対象Tx表示 + 署名提出

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/styles/caseDetailPage.module.css`
- Modify: `apps/web/src/app/pages/CaseDetailPage.test.ts`

**Step 1: Write failing test**

```ts
it("renders approval tx section", async () => {
  const html = renderToString(<CaseDetailPage initialTab="death-claims" initialIsOwner={false} />);
  expect(html).toContain("署名対象トランザクション");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- src/app/pages/CaseDetailPage.test.ts -t "approval tx"`
Expected: FAIL

**Step 3: Implement UI**

```tsx
// CaseDetailPage.tsx
// signerList 取得に加えて approvalTx を取得
// memo / destination / amount / txJson を表示 + copy
// seed 入力 -> signForMultisign -> signedBlob を表示
// signedBlob を submitSignerSignature に送信
```

**Step 4: Run tests**

Run: `pnpm -C apps/web test -- src/app/pages/CaseDetailPage.test.ts -t "approval tx"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/styles/caseDetailPage.module.css apps/web/src/app/pages/CaseDetailPage.test.ts
git commit -m "相続実行の署名対象Txと署名送信UIを追加"
```

---

### Task 8: Web - 相続人ウォレット検証のアプリ内送金

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/app/pages/CaseDetailPage.test.ts`

**Step 1: Write failing test**

```ts
it("shows in-app send button for wallet verification", async () => {
  const html = renderToString(<CaseDetailPage initialTab="wallet" initialIsOwner={false} />);
  expect(html).toContain("アプリで送金する");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- src/app/pages/CaseDetailPage.test.ts -t "in-app send"`
Expected: FAIL

**Step 3: Implement**

```tsx
// CaseDetailPage.tsx
// シークレット入力欄 + ボタン追加
// createPaymentTx -> signSingle -> submitSignedBlob
// txHash を入力欄へ反映
```

**Step 4: Run tests**

Run: `pnpm -C apps/web test -- src/app/pages/CaseDetailPage.test.ts -t "in-app send"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/app/pages/CaseDetailPage.test.ts
git commit -m "相続人ウォレット検証をアプリ内送金に対応"
```

---

### Task 9: Web - 被相続人の資産ロック方式Aをアプリ内送金対応

**Files:**
- Modify: `apps/web/src/app/pages/AssetLockPage.tsx`
- Modify: `apps/web/src/app/pages/AssetLockPage.test.ts`
- Modify: `apps/web/src/styles/assetLockPage.module.css`

**Step 1: Write failing test**

```ts
it("shows in-app send for method A", async () => {
  const html = renderToString(<AssetLockPage initialMethod="A" initialIsOwner />);
  expect(html).toContain("アプリで送金");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- src/app/pages/AssetLockPage.test.ts -t "in-app send"`
Expected: FAIL

**Step 3: Implement**

```tsx
// AssetLockPage.tsx
// 送金対象ごとにシークレット入力欄 + 送金ボタンを追加
// createPaymentTx -> signSingle -> submitSignedBlob
// txHash を入力欄へ反映
```

**Step 4: Run tests**

Run: `pnpm -C apps/web test -- src/app/pages/AssetLockPage.test.ts -t "in-app send"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/AssetLockPage.tsx apps/web/src/app/pages/AssetLockPage.test.ts apps/web/src/styles/assetLockPage.module.css
git commit -m "資産ロック方式Aのアプリ内送金を追加"
```

---

### Task 10: Final verification

**Step 1: Run focused tests**

Run:
- `pnpm -C apps/functions test -- handler.test.ts -t "approval tx"`
- `pnpm -C apps/admin test`
- `pnpm -C apps/web test -- src/app/pages/CaseDetailPage.test.ts`

Expected: PASS

---

## Notes
- Functions 修正後は必ず `task functions:build` を実行。
- docs/plans は gitignore 対象のため `git add -f` を使用する。
- xrpl WebSocket URL は `VITE_XRPL_WS_URL` を推奨（未設定の場合は testnet を使用）。

