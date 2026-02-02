# 管理画面 申請詳細 UI 微調整 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 申請詳細の表示を簡略化し、ステータス/承認操作/ファイル閲覧を運営向けに最適化する。

**Architecture:** Admin の ClaimDetailPage を中心にUIと文言を整理し、提出ファイルの閲覧リンクを表示する。既存 API はそのまま活用する。

**Tech Stack:** React (Vite), TypeScript, Vitest

---

### Task 1: ステータスの日本語表示とヘッダ整理

**Files:**
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`

**Step 1: Write the failing test**

UIテストは現状なしのため、最小のロジックテストを追加する（statusラベルの変換）。

Create: `apps/admin/src/pages/claim-status.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { toClaimStatusLabel } from "./ClaimDetailPage";

describe("claim status label", () => {
  it("maps status to Japanese label", () => {
    expect(toClaimStatusLabel("SUBMITTED")).toBe("提出済み");
    expect(toClaimStatusLabel("ADMIN_APPROVED")).toBe("運営承認済み");
    expect(toClaimStatusLabel("ADMIN_REJECTED")).toBe("差し戻し");
    expect(toClaimStatusLabel("CONFIRMED")).toBe("死亡確定");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/admin test -- claim-status.test.ts`
Expected: FAIL (関数未実装)

**Step 3: Write minimal implementation**

- `ClaimDetailPage.tsx` に `toClaimStatusLabel` を追加し export。
- 「申請詳細」ヘッダ直下の Case/Claim 表示は削除。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/admin test -- claim-status.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/admin/src/pages/ClaimDetailPage.tsx apps/admin/src/pages/claim-status.test.ts

git commit -m "申請詳細のステータス表示を日本語化"
```

---

### Task 2: ステータス近くに承認/差し戻し/理由を配置

**Files:**
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`

**Step 1: Write the failing test**

既存のUIテストはないため、配置変更のスナップショットテストは省略。代わりに文言存在を軽く検証。

```ts
// ClaimDetailPage をレンダリングし、"運営承認" と "差し戻し理由" が近接するDOM構造を確認
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/admin test`
Expected: FAIL (テスト追加時)

**Step 3: Write minimal implementation**

- 「ステータス」セクション内に承認/差し戻しボタンと理由入力を移動。
- 既存の actions ブロックは削除。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/admin test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/admin/src/pages/ClaimDetailPage.tsx

git commit -m "承認操作をステータス近くに移動"
```

---

### Task 3: ケース概要をフラット表示に変更

**Files:**
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`

**Step 1: Write the failing test**

UIテストは省略し、手動確認前提。

**Step 2: Implement minimal change**

- `file-list`/`file-row` のカード風表示を使わず、`div` のフラット列にする。
- 各項目を `label: value` の形式で並べる。

**Step 3: Run test to verify it passes**

Run: `pnpm -C apps/admin test`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/admin/src/pages/ClaimDetailPage.tsx

git commit -m "ケース概要をフラット表示に変更"
```

---

### Task 4: 提出ファイルはファイル名 + ダウンロードのみ

**Files:**
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`

**Step 1: Write the failing test**

UIテストは省略し、ファイル名とリンク表示の最低限確認。

**Step 2: Implement minimal change**

- ファイル行は `fileName` と閲覧リンクのみ表示。
- `storagePath` がある場合のみリンクを表示（URL生成は `storagePath` を直接貼るのではなく、API追加が必要なら次タスク）。
- まずは暫定的に `storagePath` を `href` で使う。

**Step 3: Run test to verify it passes**

Run: `pnpm -C apps/admin test`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/admin/src/pages/ClaimDetailPage.tsx

git commit -m "提出ファイル表示を簡略化"
```

---

### Task 5: Functions build 実行

**Step 1: Run build**

Run: `task functions:build`
Expected: PASS

**Step 2: Commit**

ビルド成果物はコミットしない。
