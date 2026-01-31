# 申請詳細 UI 微調整（被相続人プロフィール・ステータス幅）実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 申請詳細のプロフィール表示を最小化し、ステータスの幅を抑える。

**Architecture:** ClaimDetailPage の表示文言とレイアウトを調整し、データは既存の API をそのまま利用する。

**Tech Stack:** React (Vite), TypeScript, Vitest

---

### Task 1: 被相続人プロフィール表示へ置換

**Files:**
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`

**Step 1: Write the failing test**

既存テストは最小構成のため、文言変化を確認するテストを追加。

Create: `apps/admin/src/pages/claim-profile.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { profileLabel } from "./ClaimDetailPage";

describe("claim profile label", () => {
  it("uses profile label", () => {
    expect(profileLabel).toBe("被相続人プロフィール");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/admin test -- claim-profile.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- `ClaimDetailPage.tsx` に `profileLabel` を export し、表示タイトルを置換。
- 表示内容は `ownerDisplayName` のみ。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/admin test -- claim-profile.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/admin/src/pages/ClaimDetailPage.tsx apps/admin/src/pages/claim-profile.test.ts

git commit -m "被相続人プロフィール表示に変更"
```

---

### Task 2: ステータス表示の幅を抑える

**Files:**
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`
- Modify: `apps/admin/src/index.css` (必要なら)

**Step 1: Write the failing test**

UIテストは省略し、手動確認前提。

**Step 2: Implement minimal change**

- ステータスセクションに `status-inline` などのクラスを追加。
- 必要なら `index.css` に `display: inline-flex; gap; align-items` などの最小スタイルを追加。

**Step 3: Run test to verify it passes**

Run: `pnpm -C apps/admin test`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/admin/src/pages/ClaimDetailPage.tsx apps/admin/src/index.css

git commit -m "ステータス表示の幅を調整"
```

---

### Task 3: Functions build 実行

**Step 1: Run build**

Run: `task functions:build`
Expected: PASS

**Step 2: Commit**

ビルド成果物はコミットしない。
