# Inheritance Distribution Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 相続実行の同意完了後に、共有中の指図をすべて対象としてXRP+トークンの分配をサーバー側ジョブで実行し、進捗管理・再開・スキップ・エスカレができるようにする。

**Architecture:** Firestore に `distribution/state` と `distribution/items` を持ち、`POST /distribution/execute` が前提条件チェック→items作成→上限件数だけ送金→state更新。`GET /distribution` で進捗取得。UIは相続実行タブに「分配を実行」セクションを追加し、同意セクションは折りたたみ表示。

**Tech Stack:** Firebase Functions (Hono), Firestore, React, Vitest

> NOTE: このリポジトリは `git worktree` 禁止のため、既存作業ツリーで進める。

---

### Task 1: 分配進捗取得 API（GET）

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts:1080-1400`
- Test: `apps/functions/src/api/handler.test.ts:3300-3600`

**Step 1: Write the failing test**

```ts
it("returns default distribution state when missing", async () => {
  const db = getFirestore();
  await db.collection("cases").doc("case-1").set({
    caseId: "case-1",
    ownerUid: "owner-1",
    memberUids: ["owner-1", "heir-1"],
    stage: "IN_PROGRESS"
  });

  const req = authedReq("heir-1", "heir@example.com", {
    method: "GET",
    path: "/v1/cases/case-1/distribution"
  });
  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(200);
  expect(res.body?.data?.status).toBe("PENDING");
  expect(res.body?.data?.totalCount).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "returns default distribution state when missing"`
Expected: FAIL (404 or route not found)

**Step 3: Write minimal implementation**

- `GET /v1/cases/:caseId/distribution` を追加
- case ownerはアクセス不可、caseメンバーの相続人のみ許可
- stateが無い場合はデフォルトを返す（PENDING, counts=0）

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "returns default distribution state when missing"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "分配進捗取得APIを追加"
```

---

### Task 2: 分配実行 API（初回作成＋送金）

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts:1080-1700`
- Test: `apps/functions/src/api/handler.test.ts:3600-4100`

**Step 1: Write the failing test**

```ts
it("creates distribution items and completes when single xrp", async () => {
  const db = getFirestore();
  await db.collection("cases").doc("case-1").set({
    caseId: "case-1",
    ownerUid: "owner-1",
    memberUids: ["owner-1", "heir-1"],
    stage: "IN_PROGRESS"
  });
  await db.collection("cases/case-1/heirWallets").doc("heir-1").set({
    address: "rHeir",
    verificationStatus: "VERIFIED"
  });
  await db.collection("cases/case-1/assetLock").doc("state").set({
    wallet: { address: "rDest", seedEncrypted: encryptPayload("seed") }
  });
  await db.collection("cases/case-1/signerList").doc("approvalTx").set({
    status: "SUBMITTED",
    submittedTxHash: "tx-hash"
  });
  await db.collection("cases/case-1/plans").doc("plan-1").set({
    planId: "plan-1",
    status: "SHARED",
    title: "指図A",
    ownerUid: "owner-1",
    heirUids: ["heir-1"],
    heirs: [{ uid: "heir-1", email: "heir@example.com" }]
  });
  await db.collection("cases/case-1/plans/plan-1/assets").doc("plan-asset-1").set({
    planAssetId: "plan-asset-1",
    assetId: "asset-1",
    unitType: "PERCENT",
    allocations: [{ heirUid: "heir-1", value: 100 }]
  });
  await db.collection("cases/case-1/assetLockItems").doc("item-1").set({
    assetId: "asset-1",
    assetLabel: "Asset",
    token: null,
    plannedAmount: "100"
  });

  const req = authedReq("heir-1", "heir@example.com", {
    method: "POST",
    path: "/v1/cases/case-1/distribution/execute"
  });
  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(200);
  expect(res.body?.data?.status).toBe("COMPLETED");
  expect(res.body?.data?.totalCount).toBe(1);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "creates distribution items and completes when single xrp"`
Expected: FAIL (404 or missing logic)

**Step 3: Write minimal implementation**

- `POST /v1/cases/:caseId/distribution/execute`
- 前提チェック: case IN_PROGRESS / approvalTx SUBMITTED + XRPL validated / heirs wallet verified / shared plans exist / assetLock wallet exists
- 共有中の指図を取得し、allocations を元に items 作成
- XRPはdropsで計算、トークンは「金額の比率」を使って配分
- items を `distribution/items` に保存し、state を更新
- 送金は `sendXrpPayment` / `sendTokenPayment` を使い、成功で VERIFIED

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "creates distribution items and completes when single xrp"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "分配実行ジョブを追加"
```

---

### Task 3: 失敗スキップ＋エスカレ処理

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts:1080-1700`
- Test: `apps/functions/src/api/handler.test.ts:4100-4500`

**Step 1: Write the failing test**

```ts
it("skips items after retry limit and escalates", async () => {
  const db = getFirestore();
  await db.collection("cases").doc("case-1").set({
    caseId: "case-1",
    ownerUid: "owner-1",
    memberUids: ["owner-1", "heir-1"],
    stage: "IN_PROGRESS"
  });
  await db.collection("cases/case-1/distribution").doc("state").set({
    status: "RUNNING",
    retryLimit: 2
  });
  await db.collection("cases/case-1/distribution/items").doc("item-1").set({
    status: "FAILED",
    attempts: 2
  });

  const req = authedReq("heir-1", "heir@example.com", {
    method: "POST",
    path: "/v1/cases/case-1/distribution/execute"
  });
  const res = createRes();
  await handler(req as any, res as any);

  const itemSnap = await db.collection("cases/case-1/distribution/items").doc("item-1").get();
  expect(itemSnap.data()?.status).toBe("SKIPPED");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "skips items after retry limit"`
Expected: FAIL

**Step 3: Write minimal implementation**

- `attempts >= retryLimit` で `SKIPPED` へ遷移
- `escalationCount` を state に加算
- state の件数再計算

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "skips items after retry limit"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "分配失敗のスキップ処理を追加"
```

---

### Task 4: Web API（分配取得/実行）

**Files:**
- Create: `apps/web/src/app/api/distribution.ts`
- Test: `apps/web/src/app/api/distribution.test.ts`

**Step 1: Write the failing test**

```ts
it("calls distribution execute endpoint", async () => {
  const { executeDistribution } = await import("./distribution");
  await executeDistribution("case-1");
  expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/distribution/execute", { method: "POST" });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- distribution.test.ts -t "calls distribution execute endpoint"`
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

- `getDistributionState` (GET)
- `executeDistribution` (POST)

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- distribution.test.ts -t "calls distribution execute endpoint"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/distribution.ts apps/web/src/app/api/distribution.test.ts
git commit -m "分配APIクライアントを追加"
```

---

### Task 5: UI（相続実行タブの折りたたみ＋分配セクション）

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx:1315-1785`
- Modify: `apps/web/src/styles/caseDetailPage.module.css:280-520`
- Test: `apps/web/src/app/pages/CaseDetailPage.test.ts:350-500`

**Step 1: Write the failing test**

```ts
it("shows distribution section in inheritance tab", async () => {
  const { html } = await renderCaseDetail({
    tab: "death-claims",
    isOwner: false,
    distribution: { status: "PENDING", totalCount: 0 }
  });
  expect(html).toContain("分配を実行");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts -t "shows distribution section"`
Expected: FAIL

**Step 3: Write minimal implementation**

- 「相続実行の同意」を `<details>` で折りたたみ化
- 「分配を実行」セクションを追加
  - 状態/進捗/失敗/スキップ/エスカレ件数を表示
  - `分配を実行` / `再開` ボタン
  - 実行中はボタン無効
  - 事前条件不足時は理由を表示
- `distribution` API の取得/実行を `CaseDetailPage` に追加

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts -t "shows distribution section"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/styles/caseDetailPage.module.css apps/web/src/app/pages/CaseDetailPage.test.ts
git commit -m "相続実行タブに分配セクションを追加"
```

---

### Task 6: Functionsビルド & まとめ確認

**Files:**
- Modify: `apps/functions/src/**`

**Step 1: Run functions build**

Run: `task functions:build`
Expected: SUCCESS

**Step 2: Full test spot check**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-02-01-inheritance-distribution-execution-plan.md`.
Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
