# Asset Lock Complete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 送金検証が完了した後に「完了する」を押して資産ロックを確定し、ケースのステータスを更新できるようにする。

**Architecture:** フロントは送金検証ステップに完了ボタンを追加し、全アイテムが VERIFIED のときのみ有効化する。バックエンドは /asset-lock/complete を追加して未検証がある場合は 400 を返し、検証済みなら assetLock/state と case の status を更新する。

**Tech Stack:** React, TypeScript, Firestore, Hono, XRPL utilities, Vitest/Jest

---

## Design Notes

- 完了条件: assetLockItems がすべて VERIFIED。未検証が1つでもあれば完了不可。
- 完了時の更新:
  - cases/{caseId}.assetLockStatus = "LOCKED"
  - cases/{caseId}.stage = "WAITING"
  - cases/{caseId}/assetLock/state.status = "LOCKED"（既存仕様に合わせる）
  - uiStep は 4（送金検証）を維持
- UI:
  - 送金検証セクション末尾に「完了する」ボタン
  - disabled 条件: ローディング中 or 未検証アイテムあり
  - 成功後は最新ロック状態を取得して反映

---

### Task 1: API 完了エンドポイント

**Files:**
- Modify: `apps/functions/src/api/handler.test.ts`
- Modify: `apps/functions/src/api/routes/cases.ts`

**Step 1: Write the failing test**

```ts
it("completes asset lock when all items verified", async () => {
  // arrange case + assetLock state + verified items
  // act: POST /asset-lock/complete
  // assert: 200, status=LOCKED, case.stage=WAITING
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter functions test -- apps/functions/src/api/handler.test.ts`
Expected: FAIL (complete endpoint missing)

**Step 3: Write minimal implementation**

```ts
app.post(":caseId/asset-lock/complete", async (c) => {
  // owner check
  // read items, reject if any !VERIFIED
  // update assetLock/state + case status
  // return latest state
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter functions test -- apps/functions/src/api/handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/handler.test.ts apps/functions/src/api/routes/cases.ts
git commit -m "資産ロック完了APIを追加"
```

---

### Task 2: Web 完了ボタンの追加

**Files:**
- Modify: `apps/web/src/app/api/asset-lock.test.ts`
- Modify: `apps/web/src/app/pages/AssetLockPage.test.ts`
- Modify: `apps/web/src/app/api/asset-lock.ts`
- Modify: `apps/web/src/app/pages/AssetLockPage.tsx`

**Step 1: Write the failing tests**

```ts
it("enables complete button only when all items verified", async () => {
  // render with mixed statuses -> disabled
});

it("calls complete API and updates status", async () => {
  // mock completeAssetLock -> ensure called and state updated
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- src/app/pages/AssetLockPage.test.ts src/app/api/asset-lock.test.ts`
Expected: FAIL (button missing / api call missing)

**Step 3: Write minimal implementation**

```tsx
const canComplete = (lockState?.items ?? []).every((item) => item.status === "VERIFIED");
<Button onClick={handleComplete} disabled={!canComplete || completeLoading}>完了する</Button>
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- src/app/pages/AssetLockPage.test.ts src/app/api/asset-lock.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/asset-lock.test.ts apps/web/src/app/pages/AssetLockPage.test.ts apps/web/src/app/api/asset-lock.ts apps/web/src/app/pages/AssetLockPage.tsx
git commit -m "資産ロック完了UIを追加"
```

---

### Task 3: Functions Build

**Files:**
- Modify: (none)

**Step 1: Run build**

Run: `task functions:build`
Expected: succeed

**Step 2: Commit (if build updates artifacts)**

```bash
git add apps/functions/lib
if git diff --cached --quiet; then echo "no changes"; else git commit -m "Functionsビルドを更新"; fi
```

