# 相続実行タブ + MultiSign署名UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 相続実行タブに死亡診断書の折りたたみと MultiSign 署名（TXハッシュ入力）を追加し、SignerListSet 前提の署名状況を表示・提出できるようにする。

**Architecture:** CaseDetailPage の「死亡診断書」タブを「相続実行」へ改名し、DeathClaimsPanel を折りたたみで再利用。署名状況は新規の signer-list API から取得し、署名提出は txHash を保存する。Functions に signer-list の GET/POST API を追加。

**Tech Stack:** React + CSS Modules（apps/web）、Firebase Functions / Firestore（apps/functions）、Vitest。

> Note: リポジトリ方針により git worktree は使用しない。

---

### Task 1: Functions に signer-list API のテストを追加

**Files:**
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

追加テスト（例）: GET と POST を 1 本ずつ追加。

```ts
it("returns signer list status and counts", async () => {
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
});

it("accepts signer tx hash and records signature", async () => {
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
  await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
    address: "rHeir",
    verificationStatus: "VERIFIED"
  });

  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      result: {
        Account: "rAssetLock",
        Signers: [{ Signer: { Account: "rHeir" } }]
      }
    })
  }));
  (globalThis as any).fetch = fetchMock;

  const res = createRes();
  await handler(
    authedReq("heir_1", "heir@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/signer-list/sign`,
      body: { txHash: "tx_hash" }
    }) as any,
    res as any
  );

  expect(res.statusCode).toBe(200);
  expect(res.body?.data?.signaturesCount).toBe(1);
  const sigSnap = await db
    .collection(`cases/${caseId}/signerList/state/signatures`)
    .doc("heir_1")
    .get();
  expect(sigSnap.data()?.txHash).toBe("tx_hash");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- src/api/handler.test.ts`

Expected: FAIL (signer-list routes not found).

**Step 3: Write minimal implementation**

（次タスクで実装）

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- src/api/handler.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/handler.test.ts
```

---

### Task 2: Functions に signer-list API を実装

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`

**Step 1: Write minimal implementation**

追加ルート（例）:

```ts
app.get(":caseId/signer-list", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");

  const caseData = caseSnap.data() ?? {};
  const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
  if (caseData.ownerUid === auth.uid || !memberUids.includes(auth.uid)) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }

  const signerRef = caseRef.collection("signerList").doc("state");
  const signerSnap = await signerRef.get();
  const signerData = signerSnap.data() ?? null;
  const status = signerData?.status ?? "NOT_READY";
  const signaturesSnap = await signerRef.collection("signatures").get();
  const signaturesCount = signaturesSnap.docs.length;
  const signedByMe = signaturesSnap.docs.some((doc) => doc.id === auth.uid);

  const heirCount = Math.max(0, memberUids.length - 1);
  const requiredCount = Math.max(1, Math.floor(heirCount / 2) + 1);

  return jsonOk(c, {
    status,
    quorum: signerData?.quorum ?? null,
    error: signerData?.error ?? null,
    signaturesCount,
    requiredCount,
    signedByMe
  });
});

app.post(":caseId/signer-list/sign", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const body = await c.req.json().catch(() => ({}));
  const txHash = typeof body?.txHash === "string" ? body.txHash.trim() : "";
  if (!txHash) return jsonError(c, 400, "VALIDATION_ERROR", "txHashは必須です");

  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");

  const caseData = caseSnap.data() ?? {};
  const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
  if (caseData.ownerUid === auth.uid || !memberUids.includes(auth.uid)) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }

  const signerRef = caseRef.collection("signerList").doc("state");
  const signerSnap = await signerRef.get();
  if (!signerSnap.exists || signerSnap.data()?.status !== "SET") {
    return jsonError(c, 400, "SIGNER_LIST_NOT_READY", "署名準備が完了していません");
  }

  const walletSnap = await caseRef.collection("heirWallets").doc(auth.uid).get();
  const wallet = walletSnap.data() ?? {};
  const address = typeof wallet.address === "string" ? wallet.address : "";
  if (!address) return jsonError(c, 400, "WALLET_NOT_REGISTERED", "ウォレットが未登録です");

  const txResult = await fetchXrplTx(txHash);
  if (!txResult.ok) {
    return jsonError(c, 400, "TX_NOT_FOUND", txResult.message ?? "取引が見つかりません");
  }
  const signers = Array.isArray(txResult.tx?.Signers) ? txResult.tx.Signers : [];
  const hasSigner = signers.some((entry: any) => entry?.Signer?.Account === address);
  if (!hasSigner) {
    return jsonError(c, 400, "SIGNER_MISMATCH", "署名者が一致しません");
  }

  const now = c.get("deps").now();
  await signerRef.collection("signatures").doc(auth.uid).set({
    uid: auth.uid,
    address,
    txHash,
    createdAt: now
  });

  const signaturesSnap = await signerRef.collection("signatures").get();
  const signaturesCount = signaturesSnap.docs.length;
  const heirCount = Math.max(0, memberUids.length - 1);
  const requiredCount = Math.max(1, Math.floor(heirCount / 2) + 1);

  return jsonOk(c, { signaturesCount, requiredCount, signedByMe: true });
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- src/api/handler.test.ts`

Expected: PASS

**Step 3: Build**

Run: `task functions:build`

Expected: OK

**Step 4: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts
```

---

### Task 3: Web API に signer-list の取得/送信を追加

**Files:**
- Create: `apps/web/src/app/api/signer-list.ts`
- Create: `apps/web/src/app/api/signer-list.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../features/shared/lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: { ok: true } }))
}));

describe("signer-list api", () => {
  it("fetches signer list", async () => {
    const { getSignerList } = await import("./signer-list");
    await getSignerList("case-1");
    const { apiFetch } = await import("../../features/shared/lib/api");
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/v1/cases/case-1/signer-list", {
      method: "GET"
    });
  });

  it("submits signer tx hash", async () => {
    const { submitSignerSignature } = await import("./signer-list");
    await submitSignerSignature("case-1", "tx_hash");
    const { apiFetch } = await import("../../features/shared/lib/api");
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/v1/cases/case-1/signer-list/sign", {
      method: "POST",
      body: JSON.stringify({ txHash: "tx_hash" })
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- src/app/api/signer-list.test.ts`

Expected: FAIL (module not found).

**Step 3: Write minimal implementation**

`apps/web/src/app/api/signer-list.ts`:

```ts
import { apiFetch } from "../../features/shared/lib/api";

export type SignerListSummary = {
  status: "NOT_READY" | "SET" | "FAILED";
  quorum: number | null;
  error?: string | null;
  signaturesCount: number;
  requiredCount: number;
  signedByMe: boolean;
};

export const getSignerList = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list`, { method: "GET" });
  return result.data as SignerListSummary;
};

export const submitSignerSignature = async (caseId: string, txHash: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list/sign`, {
    method: "POST",
    body: JSON.stringify({ txHash })
  });
  return result.data as {
    signaturesCount: number;
    requiredCount: number;
    signedByMe: boolean;
  };
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- src/app/api/signer-list.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/signer-list.ts apps/web/src/app/api/signer-list.test.ts
```

---

### Task 4: 相続実行タブのUIを追加（死亡診断書折りたたみ + MultiSign署名）

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/styles/caseDetailPage.module.css`
- Modify: `apps/web/src/app/pages/CaseDetailPage.test.ts`

**Step 1: Write the failing test**

```ts
it("shows inheritance tab label for heir", async () => {
  authUser = { uid: "heir" };
  searchParams = new URLSearchParams();
  const html = await render({ initialIsOwner: false });
  expect(html).toContain("相続実行");
});
```

必要なら MultiSign セクションの文言も検証:

```ts
it("renders signer list section", async () => {
  authUser = { uid: "heir" };
  searchParams = new URLSearchParams("tab=death-claims");
  const html = await render({
    initialIsOwner: false,
    initialCaseData: { ...caseData, stage: "IN_PROGRESS", assetLockStatus: "LOCKED" }
  });
  expect(html).toContain("MultiSign署名");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- src/app/pages/CaseDetailPage.test.ts`

Expected: FAIL (相続実行 / MultiSign 未表示)

**Step 3: Write minimal implementation**

`CaseDetailPage.tsx`:
- タブラベルを「相続実行」に変更。
- `tab === "death-claims"` の内容を、
  - `<details>` で `DeathClaimsPanel` を包む
  - 下に MultiSign 署名セクションを追加
- signer-list API を呼ぶ state / handler を追加。

`caseDetailPage.module.css`:
- 折りたたみ見出しと署名セクション用のスタイルを追加。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- src/app/pages/CaseDetailPage.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/styles/caseDetailPage.module.css apps/web/src/app/pages/CaseDetailPage.test.ts
```

---

### Task 5: 追加統合テスト（必要なら）

**Files:**
- Optional: `apps/web/src/app/pages/DeathClaimsPage.test.ts`

必要になった場合のみ実施。基本は既存テストで十分。

---

## Execution Options

Plan complete and saved to `docs/plans/2026-02-01-inheritance-execution-ui-plan.md`.

Two execution options:

1. Subagent-Driven (this session) — use superpowers:subagent-driven-development
2. Parallel Session (separate) — open new session with superpowers:executing-plans

Which approach?
