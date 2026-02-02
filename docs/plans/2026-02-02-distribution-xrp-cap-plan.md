# Distribution XRP Auto-Cap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 分配実行時に送金元の残高とリザーブを確認し、XRPの送金額を自動調整して残高不足を避ける。

**Architecture:** `POST /v1/cases/:caseId/distribution/execute` の実行時に送金可能額を算出し、XRPアイテムだけ同一比率で縮小する。既存アイテムの再実行でも同様に適用する。

**Tech Stack:** Firebase Functions (Hono), Firestore, Vitest

> NOTE: このリポジトリは `git worktree` 禁止のため、既存作業ツリーで進める。

---

### Task 1: 新規分配のXRP送金額を上限に合わせて縮小

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts:1500-1760`
- Test: `apps/functions/src/api/handler.test.ts:3880-3990`

**Step 1: Write the failing test**

```ts
it("scales down xrp distribution when balance is insufficient", async () => {
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
    status: "DRAFT",
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
    plannedAmount: "100000000" // 100 XRP
  });

  const req = authedReq("heir_1", "heir@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/distribution/execute`
  });
  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(200);
  const itemSnap = await db.collection(`cases/${caseId}/distribution`).doc("items").collection("items").get();
  const item = itemSnap.docs[0]?.data() ?? {};
  expect(Number(item.amount)).toBeLessThan(100000000);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "scales down xrp distribution when balance is insufficient"`
Expected: FAIL (amountが縮小されない)

**Step 3: Write minimal implementation**

- 新規分配作成時に `fetchXrplAccountInfo` と `fetchXrplReserve` を使って送金上限を算出
- XRPの合計が上限を超える場合、比率で `amountDrops` を縮小
- 0以下になった場合は `NOT_READY` を返す

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "scales down xrp distribution when balance is insufficient"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "分配XRPを残高に合わせて縮小"
```

---

### Task 2: 再実行時も縮小を適用

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts:1380-1480`
- Test: `apps/functions/src/api/handler.test.ts:3960-4050`

**Step 1: Write the failing test**

```ts
it("scales down xrp on retry when balance is insufficient", async () => {
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
  await db.collection(`cases/${caseId}/distribution/items`).doc("item-1").set({
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
  const itemSnap = await db.collection(`cases/${caseId}/distribution/items`).doc("item-1").get();
  expect(Number(itemSnap.data()?.amount ?? "0")).toBeLessThan(100000000);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "scales down xrp on retry when balance is insufficient"`
Expected: FAIL

**Step 3: Write minimal implementation**

- 既存アイテムの再送時に、XRPアイテム合計を算出
- 送金可能額を超える場合、同一比率で縮小して再送
- 変更後の amount を item に保存

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "scales down xrp on retry when balance is insufficient"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "分配再実行時のXRP縮小を追加"
```

---

### Task 3: Functionsビルド & 代表テスト

**Files:**
- Modify: `apps/functions/src/**`

**Step 1: Run functions build**

Run: `task functions:build`
Expected: SUCCESS

**Step 2: Functions tests**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-02-02-distribution-xrp-cap-plan.md`.
Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
