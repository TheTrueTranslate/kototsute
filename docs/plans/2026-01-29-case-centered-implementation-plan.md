# ケース中心UX/データ再設計 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ケースをルートとしたデータ構造とUXに全面移行し、表示名/ケース一覧/ケース詳細/資産/指図/相続人/死亡確定フローを一貫したAPIとUIで提供する。

**Architecture:** Firestoreのルートを`cases/{caseId}`へ統一し、全リソースはcaseId必須。FunctionsはHono APIに`/v1/cases`配下のルートを追加し、Webはケース中心のルーティングへ移行する。

**Tech Stack:** Firebase Functions (Hono), Firestore, React (Vite), TypeScript, Vitest, Zod

---

## Constraints / Notes
- 既存データは破棄前提（移行は行わない）。
- このリポジトリでは git worktree を使わない。
- Functions を変更したら `task functions:build` を実行する。
- docs/plans は .gitignore 対象のため `git add -f` を使う。

---

### Task 1: 表示名・ケース用のZodスキーマ追加

**Files:**
- Create: `packages/shared/src/validation/case-schema.ts`
- Create: `packages/shared/src/validation/case-schema.test.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { caseCreateInputSchema, displayNameSchema } from "./case-schema";

describe("case schema", () => {
  it("accepts display name and case create input", () => {
    expect(displayNameSchema.safeParse("山田 太郎").success).toBe(true);
    expect(caseCreateInputSchema.safeParse({}).success).toBe(true);
  });

  it("rejects empty display name", () => {
    expect(displayNameSchema.safeParse("").success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C packages/shared test -- case-schema`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

```ts
import { z } from "zod";

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "表示名を入力してください")
  .max(50, "表示名は50文字以内で入力してください");

export const caseCreateInputSchema = z.object({});
```

`packages/shared/src/index.ts` に export を追加。

**Step 4: Run test to verify it passes**

Run: `pnpm -C packages/shared test -- case-schema`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/validation/case-schema.ts packages/shared/src/validation/case-schema.test.ts packages/shared/src/index.ts
git commit -m "ケース用スキーマを追加"
```

---

### Task 2: Caseドメインのステータス更新

**Files:**
- Modify: `packages/case/src/domain/case-status.ts`
- Modify: `packages/case/src/domain/case.ts`
- Modify: `packages/case/src/domain/case.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Case } from "./case";
import { CaseId } from "./value/case-id";
import { OccurredAt } from "./value/occurred-at";

describe("Case", () => {
  it("moves through draft -> waiting -> in_progress -> completed", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00Z"));
    const base = Case.create(CaseId.create("case-1"), now);
    const waiting = base.moveToWaiting(now);
    const progress = waiting.moveToInProgress(now);
    const completed = progress.complete(now);
    expect(completed.getStatus()).toBe("COMPLETED");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C packages/case test -- case.test`
Expected: FAIL (methods/status not found)

**Step 3: Write minimal implementation**

```ts
export type CaseStatus = "DRAFT" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
```

```ts
static create(id: CaseId, now: OccurredAt): Case {
  return new Case(id, "DRAFT", now);
}

moveToWaiting(now: OccurredAt): Case {
  return new Case(this.id, "WAITING", now);
}

moveToInProgress(now: OccurredAt): Case {
  return new Case(this.id, "IN_PROGRESS", now);
}

complete(now: OccurredAt): Case {
  return new Case(this.id, "COMPLETED", now);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C packages/case test -- case.test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/case/src/domain/case-status.ts packages/case/src/domain/case.ts packages/case/src/domain/case.test.ts
git commit -m "ケースのステータスを更新"
```

---

### Task 3: Caseリポジトリ（Firestore + InMemory）追加

**Files:**
- Create: `packages/case/src/repository/case-repository.ts`
- Create: `packages/case/src/repository/firestore-case-repository.ts`
- Create: `apps/functions/src/api/utils/in-memory-case-repo.ts`
- Modify: `packages/case/src/index.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { InMemoryCaseRepository } from "../../../../apps/functions/src/api/utils/in-memory-case-repo";

describe("InMemoryCaseRepository", () => {
  it("creates and finds case by owner", async () => {
    const repo = new InMemoryCaseRepository();
    const created = await repo.createCase({ ownerUid: "owner-1", ownerDisplayName: "山田" });
    const found = await repo.getCaseByOwnerUid("owner-1");
    expect(found?.caseId).toBe(created.caseId);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- in-memory-case-repo`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

```ts
export type CaseRecord = {
  caseId: string;
  ownerUid: string;
  ownerDisplayName: string;
  stage: "DRAFT" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
  assetLockStatus: "UNLOCKED" | "LOCKED";
  createdAt: Date;
  updatedAt: Date;
};

export interface CaseRepository {
  createCase(input: { ownerUid: string; ownerDisplayName: string }): Promise<CaseRecord>;
  getCaseByOwnerUid(ownerUid: string): Promise<CaseRecord | null>;
  listCasesByMemberUid(uid: string): Promise<CaseRecord[]>;
}
```

InMemory は `Map` で最小実装。Firestore は `cases` コレクションを読み書きするだけの最小実装。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- in-memory-case-repo`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/case/src/repository/case-repository.ts packages/case/src/repository/firestore-case-repository.ts apps/functions/src/api/utils/in-memory-case-repo.ts packages/case/src/index.ts
git commit -m "ケースリポジトリを追加"
```

---

### Task 4: Functions 依存注入に CaseRepo を追加

**Files:**
- Modify: `apps/functions/src/api/types.ts`
- Modify: `apps/functions/src/api/deps.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createDefaultDeps } from "./deps";

describe("deps", () => {
  it("provides case repository", () => {
    const deps = createDefaultDeps();
    expect(deps.caseRepo).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- deps`
Expected: FAIL (caseRepo undefined)

**Step 3: Write minimal implementation**

`types.ts`
```ts
caseRepo: import("@kototsute/case").CaseRepository;
```

`deps.ts`
```ts
import { FirestoreCaseRepository } from "@kototsute/case";
// ...
const caseRepo = new FirestoreCaseRepository();
return { repo, caseRepo, now: () => new Date(), getAuthUser, getOwnerUidForRead };
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- deps`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/types.ts apps/functions/src/api/deps.ts
git commit -m "Functionsにケース依存を追加"
```

---

### Task 5: ケース作成/一覧/詳細 API 追加

**Files:**
- Create: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/app.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("creates and lists cases", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  await handler(authedReq("owner_1", "owner@example.com", {
    method: "POST",
    path: "/v1/cases",
    body: { ownerDisplayName: "山田" }
  }) as any, createRes() as any);

  const listRes = createRes();
  await handler(authedReq("owner_1", "owner@example.com", {
    method: "GET",
    path: "/v1/cases"
  }) as any, listRes as any);

  expect(listRes.statusCode).toBe(200);
  expect(listRes.body?.data?.created?.length).toBe(1);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL (route not found)

**Step 3: Write minimal implementation**

`/v1/cases` を追加し、
- POST: ownerUid のケースがなければ作成（あれば409）
- GET: created/received の2配列を返す

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS (new test)

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/app.ts apps/functions/src/api/handler.test.ts
git commit -m "ケースAPIを追加"
```

---

### Task 6: ケース招待 API 追加（作成/一覧/受諾/辞退）

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("invites and accepts case member", async () => {
  // 1) create case
  // 2) invite heir
  // 3) accept invite
  // 4) ensure member status is accepted
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL (not implemented)

**Step 3: Write minimal implementation**

- `POST /v1/cases/:id/invites`
- `GET /v1/cases/:id/invites?scope=owner|received`
- `POST /v1/cases/:id/invites/:inviteId/accept`
- `POST /v1/cases/:id/invites/:inviteId/decline`

既存 invites の仕様に沿いつつ、caseId を必須に。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "ケース招待APIを追加"
```

---

### Task 7: ケース資産 API 追加

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("creates and lists assets under case", async () => {
  // create case -> POST /v1/cases/:id/assets
  // GET /v1/cases/:id/assets
  // expect list length 1
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- `POST /v1/cases/:id/assets`
- `GET /v1/cases/:id/assets`
- `DELETE /v1/cases/:id/assets/:assetId`

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "ケース配下の資産APIを追加"
```

---

### Task 8: ケース指図 API 追加（共有/重複チェック含む）

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("prevents sharing when assets overlap with shared plans", async () => {
  // create case -> plan A shared with asset X
  // create plan B and try to share with asset X
  // expect 400
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- `POST /v1/cases/:id/plans`
- `GET /v1/cases/:id/plans`
- `GET /v1/cases/:id/plans/:planId`
- `POST /v1/cases/:id/plans/:planId/share`
- `POST /v1/cases/:id/plans/:planId/inactivate`
- `POST /v1/cases/:id/plans/:planId/assets`
- `POST /v1/cases/:id/plans/:planId/assets/:planAssetId/allocations`

共有時に「SHARED指図間の資産重複」をチェックし、重複があれば400。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "ケース指図APIを追加"
```

---

### Task 9: 資産ロック/未分配承認 API 追加

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("blocks asset lock when any plan is not shared", async () => {
  // create case -> create plan DRAFT
  // POST /v1/cases/:id/asset-lock
  // expect 400
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- `POST /v1/cases/:id/asset-approvals` (assetId 単位のOK)
- `POST /v1/cases/:id/asset-lock`

asset-lock は以下を満たす場合のみ `assetLockStatus=LOCKED`:
- INACTIVE以外の全指図がSHARED
- 未分配資産があれば承認済み

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "資産ロックAPIを追加"
```

---

### Task 10: 死亡診断書（提出/運営承認/同意）API 追加

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("confirms death after admin approve and majority consent", async () => {
  // submit claim -> admin approve -> 2/3 consent -> expect case stage IN_PROGRESS
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

- `POST /v1/cases/:id/death-claims` (submitted)
- `POST /v1/cases/:id/death-claims/:claimId/admin-approve`
- `POST /v1/cases/:id/death-claims/:claimId/confirm`

過半数同意で `deathClaims.status=CONFIRMED` とし、`cases.stage=IN_PROGRESS` に更新。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "死亡診断書フローAPIを追加"
```

---

### Task 11: Firestore ルール更新

**Files:**
- Modify: `firestore.rules`

**Step 1: Write the failing test**

（ルールテストが無い場合はルール適用のための TODO を追加）

**Step 2: Implement minimal rules**

- `cases` / `cases/*/members` / `cases/*/invites` / `cases/*/assets` / `cases/*/plans` / `cases/*/deathClaims`
- OWNER は read/write
- HEIR はケースと共有済み指図のみ read

**Step 3: Run emulator smoke check**

Run: `task firebase:emulate`
Expected: emulator starts without rule parse errors

**Step 4: Commit**

```bash
git add firestore.rules
git commit -m "ケース中心の権限ルールに更新"
```

---

### Task 12: Web API クライアントをケース対応へ更新

**Files:**
- Create: `apps/web/src/app/api/cases.ts`
- Modify: `apps/web/src/app/api/plans.ts`
- Modify: `apps/web/src/app/api/assets.ts`
- Modify: `apps/web/src/app/api/invites.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { listCases } from "./cases";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: [] }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("cases api", () => {
  it("calls /v1/cases", async () => {
    await listCases();
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases", { method: "GET" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- cases`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

`cases.ts` に `createCase`, `listCases`, `getCase` を追加し、既存 API を `caseId` 前提に変更。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- cases`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/cases.ts apps/web/src/app/api/plans.ts apps/web/src/app/api/assets.ts apps/web/src/app/api/invites.ts
git commit -m "WebのケースAPIクライアントを追加"
```

---

### Task 13: 登録フローに表示名を追加

**Files:**
- Modify: `apps/web/src/app/pages/RegisterPage.tsx`
- Modify: `apps/web/src/features/auth/*` (登録時のprofile保存)
- Modify: `apps/functions/src/api/routes/*` (プロフィール保存用APIが必要なら追加)

**Step 1: Write the failing test**

```ts
import { render, screen } from "@testing-library/react";
import RegisterPage from "./RegisterPage";

it("shows display name field", () => {
  render(<RegisterPage />);
  expect(screen.getByLabelText("表示名")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- RegisterPage`
Expected: FAIL

**Step 3: Write minimal implementation**

- 登録フォームに表示名フィールド
- 登録時に `profiles/{uid}` を作成（Functions API もしくは Firestore 直書き）

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- RegisterPage`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/RegisterPage.tsx apps/web/src/features/auth
git commit -m "登録時に表示名を追加"
```

---

### Task 14: ケース一覧/詳細画面を追加

**Files:**
- Create: `apps/web/src/app/pages/CasesPage.tsx`
- Create: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/features/shared/components/app-sidebar.tsx`
- Modify: `apps/web/src/features/shared/components/breadcrumbs.tsx`

**Step 1: Write the failing test**

```ts
it("routes to /cases", () => {
  // render App and expect CasesPage heading
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- cases-page`
Expected: FAIL

**Step 3: Write minimal implementation**

- `/` は `CasesPage` に変更
- `/cases/:caseId` で `CaseDetailPage`
- サイドバーの項目を「ケース」に置換

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- cases-page`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CasesPage.tsx apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/app/App.tsx apps/web/src/features/shared/components/app-sidebar.tsx apps/web/src/features/shared/components/breadcrumbs.tsx
git commit -m "ケース画面のルーティングを追加"
```

---

### Task 15: ケース詳細タブ（資産/指図/書類）を実装

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/app/pages/PlanDetailPage.tsx` (ケース配下に統合)
- Modify: `apps/web/src/app/pages/AssetsPage.tsx` (ケース配下に統合)

**Step 1: Write the failing test**

```ts
it("shows tabs: assets/plans/documents", () => {
  // render CaseDetailPage and check tab labels
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- case-detail`
Expected: FAIL

**Step 3: Write minimal implementation**

- ケース詳細のタブ UI
- 相続人は資産タブを非表示
- 指図タブは共有済みのみ表示

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- case-detail`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/app/pages/PlanDetailPage.tsx apps/web/src/app/pages/AssetsPage.tsx
git commit -m "ケース詳細タブを実装"
```

---

### Task 16: タスク一覧・ステータス/ロックバッジの表示

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`

**Step 1: Write the failing test**

```ts
it("shows status and lock badge", () => {
  // render CaseDetailPage and check for status badge
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- case-detail`
Expected: FAIL

**Step 3: Write minimal implementation**

- ステータス/ロック状態のバッジ表示
- タスク一覧の完了状態を算出

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- case-detail`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx
git commit -m "ケースのステータス表示を追加"
```

---

### Task 17: 旧画面/旧APIの整理

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Remove: `apps/web/src/app/pages/AssetsPage.tsx` (必要なら置換)
- Remove: `apps/web/src/app/pages/PlansPage.tsx`
- Remove: `apps/web/src/app/pages/InvitesPage.tsx`
- Modify: `apps/functions/src/api/app.ts`

**Step 1: Write the failing test**

- 旧ルートにアクセスした際に 404 を返すテストを追加

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test` / `pnpm -C apps/functions test`
Expected: FAIL

**Step 3: Write minimal implementation**

- 旧ルートの削除 / 互換リダイレクト
- Functions の旧 routes を削除 or 410 を返す

**Step 4: Run tests to verify it passes**

Run: `pnpm -C apps/web test` / `pnpm -C apps/functions test`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/web/src/app/App.tsx apps/web/src/app/pages apps/functions/src/api/app.ts
git commit -m "旧ルートを整理"
```

---

## Verification
- `pnpm -C packages/shared test`
- `pnpm -C packages/case test`
- `pnpm -C apps/functions test`
- `pnpm -C apps/web test`
- `task functions:build`

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-01-29-case-centered-implementation-plan.md`.

Two execution options:

1. Subagent-Driven (this session) — **このリポジトリではサブエージェント不可のため選択不可**
2. Parallel Session (separate) — 別セッションで `superpowers:executing-plans` を使って順番に実施

Which approach?
