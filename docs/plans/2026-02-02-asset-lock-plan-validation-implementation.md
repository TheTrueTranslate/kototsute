# 資産ロック開始の指図/相続人バリデーション Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 資産ロック開始時に、有効な指図が0件または相続人未設定の指図がある場合は開始できないようにする（API/ UI の両方）。

**Architecture:** Functions の `asset-lock/start` にプラン検証ガードを追加し、UI は `AssetLockPage` で同条件を判定してボタン無効化と理由表示を行う。判定対象は `status !== "INACTIVE"` の指図のみ。UI は plan/heir データの読み込み完了後に判定する。

**Tech Stack:** TypeScript, Firebase Functions (Hono), React, Vitest

---

### Task 1: Functions - 有効指図0件の失敗テストを追加

**Files:**
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("blocks asset lock start when no active plans", async () => {
  process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
  const fetchOriginal = (globalThis as any).fetch;
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      result: { account_id: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe", master_seed: "sTestSeed" }
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
      body: { method: "A" }
    }) as any,
    res as any
  );

  expect(res.statusCode).toBe(400);
  expect(res.body?.code).toBe("NOT_READY");
  expect(res.body?.message).toBe("相続対象の指図がありません");
  (globalThis as any).fetch = fetchOriginal;
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter functions test -- apps/functions/src/api/handler.test.ts`

Expected: FAIL（200 が返ってしまう）

---

### Task 2: Functions - 有効指図0件のガードを実装

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`

**Step 1: Write minimal implementation**

`app.post(":caseId/asset-lock/start", ...)` の owner 判定直後に追加:

```ts
    const plansSnap = await caseRef.collection("plans").get();
    const activePlans = plansSnap.docs
      .map((doc) => doc.data() ?? {})
      .filter((plan) => (plan.status ?? "DRAFT") !== "INACTIVE");
    if (activePlans.length === 0) {
      return jsonError(c, 400, "NOT_READY", "相続対象の指図がありません");
    }
```

**Step 2: Run test to verify it passes**

Run: `pnpm --filter functions test -- apps/functions/src/api/handler.test.ts`

Expected: PASS（Task 1 のテストが緑）

---

### Task 3: Functions - 相続人未設定の失敗テストを追加

**Files:**
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("blocks asset lock start when an active plan has no heirs", async () => {
  process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");
  const fetchOriginal = (globalThis as any).fetch;
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      result: { account_id: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe", master_seed: "sTestSeed" }
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

  const createPlanRes = createRes();
  await handler(
    authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/plans`,
      body: { title: "指図A" }
    }) as any,
    createPlanRes as any
  );

  const res = createRes();
  await handler(
    authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/asset-lock/start`,
      body: { method: "A" }
    }) as any,
    res as any
  );

  expect(res.statusCode).toBe(400);
  expect(res.body?.code).toBe("NOT_READY");
  expect(res.body?.message).toBe("相続人が未設定の指図があります");
  (globalThis as any).fetch = fetchOriginal;
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter functions test -- apps/functions/src/api/handler.test.ts`

Expected: FAIL（200 が返ってしまう）

---

### Task 4: Functions - 相続人未設定のガードを実装

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`

**Step 1: Write minimal implementation**

Task 2 で作った `activePlans` の直後に追加:

```ts
    const hasMissingHeirs = activePlans.some((plan) => {
      const heirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
      return heirUids.length === 0;
    });
    if (hasMissingHeirs) {
      return jsonError(c, 400, "NOT_READY", "相続人が未設定の指図があります");
    }
```

**Step 2: Run test to verify it passes**

Run: `pnpm --filter functions test -- apps/functions/src/api/handler.test.ts`

Expected: PASS

**Step 3: Build Functions (repo rule)**

Run: `task functions:build`

Expected: PASS

**Step 4: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "資産ロック開始の指図条件を追加"
```

---

### Task 5: UI - 指図0件の失敗テストを追加

**Files:**
- Modify: `apps/web/src/app/pages/AssetLockPage.test.ts`

**Step 1: Write the failing test**

```ts
it("disables confirm when no active plans", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialIsOwner: true,
        initialPlans: []
      })
    )
  );
  expect(html).toContain("相続対象の指図がありません");
  expect(html).toMatch(/<button[^>]*\sdisabled(=|>)[^>]*>確認しました/);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter kototsute test -- apps/web/src/app/pages/AssetLockPage.test.ts`

Expected: FAIL（メッセージ/disabled が出ない）

---

### Task 6: UI - 指図0件のバリデーションを実装

**Files:**
- Modify: `apps/web/src/app/pages/AssetLockPage.tsx`

**Step 1: Write minimal implementation**

`AssetLockPage` 内に追加（`const current = steps[stepIndex];` の近く）:

```ts
  const activePlans = useMemo(
    () => plans.filter((plan) => plan.status !== "INACTIVE"),
    [plans]
  );
  const isPlanDataReady =
    !planLoading &&
    activePlans.every((plan) => planHeirsById[plan.planId] !== undefined);
  const planValidationError = useMemo(() => {
    if (!isPlanDataReady) return null;
    if (activePlans.length === 0) return "相続対象の指図がありません";
    return null;
  }, [activePlans, isPlanDataReady]);
```

準備ステップのボタンと表示を更新:

```tsx
{planValidationError ? <FormAlert variant="error">{planValidationError}</FormAlert> : null}
<Button type="button" onClick={handleConfirmPreparation} disabled={loading || !!planValidationError}>
  {loading ? "記録中..." : "確認しました"}
</Button>
```

**Step 2: Run test to verify it passes**

Run: `pnpm --filter kototsute test -- apps/web/src/app/pages/AssetLockPage.test.ts`

Expected: PASS（Task 5 が緑）

---

### Task 7: UI - 相続人未設定の失敗テストを追加

**Files:**
- Modify: `apps/web/src/app/pages/AssetLockPage.test.ts`

**Step 1: Write the failing test**

```ts
it("disables start when a plan has no heirs", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialIsOwner: true,
        initialStep: 1,
        initialPlans: [
          { planId: "plan-1", title: "指図A", status: "DRAFT", sharedAt: null, updatedAt: "2024-01-01" }
        ],
        initialPlanHeirs: { "plan-1": [] }
      })
    )
  );
  expect(html).toContain("相続人が未設定の指図があります");
  expect(html).toMatch(/<button[^>]*\sdisabled(=|>)[^>]*>ロックを開始/);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter kototsute test -- apps/web/src/app/pages/AssetLockPage.test.ts`

Expected: FAIL（メッセージ/disabled が出ない）

---

### Task 8: UI - 相続人未設定のバリデーションを実装

**Files:**
- Modify: `apps/web/src/app/pages/AssetLockPage.tsx`

**Step 1: Write minimal implementation**

Task 6 の `planValidationError` を拡張:

```ts
  const planValidationError = useMemo(() => {
    if (!isPlanDataReady) return null;
    if (activePlans.length === 0) return "相続対象の指図がありません";
    const hasMissingHeirs = activePlans.some(
      (plan) => (planHeirsById[plan.planId]?.length ?? 0) === 0
    );
    if (hasMissingHeirs) return "相続人が未設定の指図があります";
    return null;
  }, [activePlans, isPlanDataReady, planHeirsById]);
```

方式選択ステップの開始ボタン/表示を更新:

```tsx
{planValidationError ? <FormAlert variant="error">{planValidationError}</FormAlert> : null}
<Button type="button" onClick={handleStart} disabled={loading || !!planValidationError}>
  {loading ? "開始中..." : "ロックを開始"}
</Button>
```

**Step 2: Run test to verify it passes**

Run: `pnpm --filter kototsute test -- apps/web/src/app/pages/AssetLockPage.test.ts`

Expected: PASS（Task 7 が緑）

**Step 3: Commit**

```bash
git add apps/web/src/app/pages/AssetLockPage.tsx apps/web/src/app/pages/AssetLockPage.test.ts
git commit -m "資産ロック開始前の指図検証を追加"
```
