# 指図削除（資産なし時のみ）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 資産が1件もない指図のみ削除できるようにし、資産がある場合は理由付きで拒否する。

**Architecture:** Functions のケース配下プラン API に削除エンドポイントを追加し、assets サブコレクション件数で削除可否を判定する。Web は指図詳細で削除導線を追加し、API のエラーメッセージをそのまま表示する。

**Tech Stack:** Hono (Functions), Firestore, React, React Router, Radix Dialog, Vitest

**Constraints:** リポジトリ方針で `git worktree` は使用しない。現在の作業ツリーで進める。

### Task 1: Functions の削除 API をテストで定義する

**Files:**
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("deletes plan when no assets", async () => {
  const caseId = "case-1";
  const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
  await planRef.set({
    planId: planRef.id,
    ownerUid: "owner-1",
    title: "指図A",
    status: "DRAFT",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const res = await request({
    method: "DELETE",
    path: `/v1/cases/${caseId}/plans/${planRef.id}`,
    uid: "owner-1"
  });

  expect(res.status).toBe(200);
  const deleted = await planRef.get();
  expect(deleted.exists).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- --runInBand -t "deletes plan when no assets"`
Expected: FAIL (404 or route not found)

**Step 3: Write the failing test for assets-exist guard**

```ts
it("rejects delete when plan has assets", async () => {
  const caseId = "case-1";
  const planRef = await getFirestore().collection(`cases/${caseId}/plans`).doc();
  await planRef.set({
    planId: planRef.id,
    ownerUid: "owner-1",
    title: "指図A",
    status: "DRAFT",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await getFirestore()
    .collection(`cases/${caseId}/plans/${planRef.id}/assets`)
    .doc("asset-1")
    .set({ planAssetId: "asset-1", createdAt: new Date(), updatedAt: new Date() });

  const res = await request({
    method: "DELETE",
    path: `/v1/cases/${caseId}/plans/${planRef.id}`,
    uid: "owner-1"
  });

  expect(res.status).toBe(400);
  expect(res.body?.message).toBe("資産が追加されているため削除できません");
});
```

**Step 4: Run tests to verify they fail**

Run: `pnpm -C apps/functions test -- --runInBand -t "delete plan"`
Expected: FAIL (route missing)

**Step 5: Commit**

```bash
git add apps/functions/src/api/handler.test.ts
git commit -m "指図削除APIのテストを追加"
```

### Task 2: Functions の削除 API を実装する

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts` (必要ならテスト調整)

**Step 1: Write minimal implementation**

```ts
app.delete(":caseId/plans/:planId", async (c) => {
  const caseId = c.req.param("caseId");
  const planId = c.req.param("planId");
  const auth = c.get("auth");
  const db = getFirestore();
  const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
  const planSnap = await planRef.get();
  if (!planSnap.exists) {
    return jsonError(c, 404, "NOT_FOUND", "Plan not found");
  }
  const plan = planSnap.data() ?? {};
  if (plan.ownerUid !== auth.uid) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }

  const assetsSnap = await db.collection(`cases/${caseId}/plans/${planId}/assets`).limit(1).get();
  if (!assetsSnap.empty) {
    return jsonError(c, 400, "HAS_ASSETS", "資産が追加されているため削除できません");
  }

  await planRef.delete();
  return jsonOk(c);
});
```

**Step 2: Run tests to verify they pass**

Run: `pnpm -C apps/functions test -- --runInBand -t "delete plan"`
Expected: PASS

**Step 3: Run build required by repo rule**

Run: `task functions:build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "指図削除APIを追加"
```

### Task 3: Web の削除導線を追加する

**Files:**
- Modify: `apps/web/src/app/api/plans.ts`
- Modify: `apps/web/src/app/pages/CasePlanDetailPage.tsx`
- Modify: `apps/web/src/styles/caseDetailPage.module.css` (必要なら)
- Test: `apps/web/src/app/pages/CasePlanDetailPage.test.ts` (最小)

**Step 1: Write failing test (SSRで削除導線の表示条件)**

```ts
it("shows delete action for owner", async () => {
  const html = await render();
  expect(html).toContain("指図を削除");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- --runInBand -t "shows delete action for owner"`
Expected: FAIL

**Step 3: Implement minimal UI**

```ts
export const deletePlan = async (caseId: string, planId: string) => {
  await apiFetch(`/v1/cases/${caseId}/plans/${planId}`, { method: "DELETE" });
};
```

- `CasePlanDetailPage` に削除ボタンと確認ダイアログを追加
- `assets.length > 0` ならボタンを disabled、理由文を表示
- 成功時は `navigate(`/cases/${caseId}`)`
- 失敗時は `FormAlert` で `err?.message` を表示

**Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web test -- --runInBand -t "shows delete action for owner"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/plans.ts apps/web/src/app/pages/CasePlanDetailPage.tsx apps/web/src/app/pages/CasePlanDetailPage.test.ts apps/web/src/styles/caseDetailPage.module.css
git commit -m "指図削除のUIを追加"
```

### Task 4: 動作確認

**Files:**
- None

**Step 1: Run targeted tests**

Run: `pnpm -C apps/functions test -- --runInBand -t "delete plan"`
Expected: PASS

Run: `pnpm -C apps/web test -- --runInBand -t "指図"`
Expected: PASS

**Step 2: Commit (if any adjustments)**

```bash
git status --short
```

