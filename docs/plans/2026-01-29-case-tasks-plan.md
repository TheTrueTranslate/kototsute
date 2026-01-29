# Case Tasks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ケース詳細に「タスク」タブを追加し、共有/個人タスクの完了状態を保存できるようにする。

**Architecture:** Todoマスターは `packages/tasks` に置き、Webはそれを読み込んで表示する。完了状態は `cases/{caseId}/taskProgress` に保存し、Functions API 経由で読み書きする。

**Tech Stack:** React (Vite), Hono (Cloud Functions), Firestore, Vitest

---

### Task 1: `packages/tasks` を作成してテスト基盤を用意する

**Files:**
- Create: `packages/tasks/package.json`
- Create: `packages/tasks/tsconfig.json`
- Create: `packages/tasks/vitest.config.ts`
- Create: `packages/tasks/src/index.ts`

**Step 1: Write the failing test**

Create `packages/tasks/src/todo-master.test.ts` with a failing import:

```ts
import { describe, expect, it } from "vitest";
import { todoMaster } from "./todo-master";

describe("todoMaster", () => {
  it("exports sections", () => {
    expect(todoMaster.shared).toBeDefined();
    expect(todoMaster.owner).toBeDefined();
    expect(todoMaster.heir).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @kototsute/tasks test`
Expected: FAIL with module not found or missing file.

**Step 3: Write minimal implementation**

Create scaffolding files:

`packages/tasks/package.json`
```json
{
  "name": "@kototsute/tasks",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.2",
    "vitest": "^2.0.5"
  }
}
```

`packages/tasks/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/tasks/vitest.config.ts`
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node"
  }
});
```

`packages/tasks/src/index.ts`
```ts
export * from "./todo-master.js";
export * from "./types.js";
```

Create `packages/tasks/src/types.ts`:
```ts
export type TaskItem = {
  id: string;
  title: string;
  description?: string;
  priority?: number;
  requiresWallet?: boolean;
};

export type TodoMaster = {
  shared: TaskItem[];
  owner: TaskItem[];
  heir: TaskItem[];
};
```

Create `packages/tasks/src/todo-master.ts` with minimal data:
```ts
import type { TodoMaster } from "./types.js";

export const todoMaster: TodoMaster = {
  shared: [
    { id: "shared.confirm-plan", title: "指図内容を確認", description: "共有内容を確認する" }
  ],
  owner: [
    { id: "owner.register-assets", title: "資産を登録", description: "相続対象の資産を登録する" }
  ],
  heir: [
    {
      id: "heir.register-wallet",
      title: "相続人ウォレットを登録",
      description: "自分の受取用ウォレットを登録する",
      requiresWallet: true
    }
  ]
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @kototsute/tasks test`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/tasks

git commit -m "タスクマスター用パッケージを追加"
```

---

### Task 2: Todo マスターの整合性テストを追加

**Files:**
- Modify: `packages/tasks/src/todo-master.test.ts`

**Step 1: Write the failing test**

Extend test to ensure ID uniqueness:

```ts
import { describe, expect, it } from "vitest";
import { todoMaster } from "./todo-master";

const allIds = [...todoMaster.shared, ...todoMaster.owner, ...todoMaster.heir].map(
  (task) => task.id
);

describe("todoMaster", () => {
  it("exports sections", () => {
    expect(todoMaster.shared).toBeDefined();
    expect(todoMaster.owner).toBeDefined();
    expect(todoMaster.heir).toBeDefined();
  });

  it("does not have duplicate ids", () => {
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @kototsute/tasks test`
Expected: PASS (no duplicates). If it fails, fix IDs.

**Step 3: Commit**

```bash
git add packages/tasks/src/todo-master.test.ts

git commit -m "タスクマスターのID整合性テストを追加"
```

---

### Task 3: Functions にタスク進捗APIを追加

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Test: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

Add tests (patternは既存のケースAPIテストを踏襲):

```ts
it("returns task progress for member", async () => {
  const res = createRes();
  const req = createReq({
    method: "GET",
    path: "/v1/cases/case-1/task-progress"
  });
  await app.fetch(req as any, res as any);
  expect(res.statusCode).toBe(200);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @kototsute/functions test`
Expected: FAIL (route not found)

**Step 3: Write minimal implementation**

Add new routes near `:caseId/heirs`:

```ts
app.get(":caseId/task-progress", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  const caseData = caseSnap.data() ?? {};
  const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
  if (caseData.ownerUid !== auth.uid && !memberUids.includes(auth.uid)) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }

  const sharedRef = db.doc(`cases/${caseId}/taskProgress/shared`);
  const userRef = db.doc(`cases/${caseId}/taskProgress/users/${auth.uid}`);
  const [sharedSnap, userSnap] = await Promise.all([sharedRef.get(), userRef.get()]);

  const shared = sharedSnap.data() ?? {};
  const user = userSnap.data() ?? {};
  const sharedCompletedTaskIds = Array.isArray(shared.completedTaskIds)
    ? shared.completedTaskIds
    : [];
  const userCompletedTaskIds = Array.isArray(user.completedTaskIds)
    ? user.completedTaskIds
    : [];

  return jsonOk(c, { sharedCompletedTaskIds, userCompletedTaskIds });
});

app.post(":caseId/task-progress/shared", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const body = await c.req.json().catch(() => ({}));
  const completedTaskIds = Array.isArray(body?.completedTaskIds)
    ? body.completedTaskIds.filter((id: any) => typeof id === "string" && id.trim().length > 0)
    : [];
  const uniqueIds = Array.from(new Set(completedTaskIds));

  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  const caseData = caseSnap.data() ?? {};
  const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
  if (caseData.ownerUid !== auth.uid && !memberUids.includes(auth.uid)) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }

  await db.doc(`cases/${caseId}/taskProgress/shared`).set(
    { completedTaskIds: uniqueIds, updatedAt: c.get("deps").now() },
    { merge: true }
  );
  return jsonOk(c);
});

app.post(":caseId/task-progress/me", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const body = await c.req.json().catch(() => ({}));
  const completedTaskIds = Array.isArray(body?.completedTaskIds)
    ? body.completedTaskIds.filter((id: any) => typeof id === "string" && id.trim().length > 0)
    : [];
  const uniqueIds = Array.from(new Set(completedTaskIds));

  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  const caseData = caseSnap.data() ?? {};
  const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
  if (caseData.ownerUid !== auth.uid && !memberUids.includes(auth.uid)) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }

  await db.doc(`cases/${caseId}/taskProgress/users/${auth.uid}`).set(
    { completedTaskIds: uniqueIds, updatedAt: c.get("deps").now() },
    { merge: true }
  );
  return jsonOk(c);
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @kototsute/functions test`
Expected: PASS

**Step 5: Run build (required)**

Run: `task functions:build`
Expected: success

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts

git commit -m "タスク進捗APIを追加"
```

---

### Task 4: Web API 追加

**Files:**
- Create: `apps/web/src/app/api/tasks.ts`
- Test: `apps/web/src/app/api/tasks.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../features/shared/lib/api";

vi.mock("../../features/shared/lib/api", () => ({ apiFetch: vi.fn() }));

describe("tasks api", () => {
  it("calls /v1/cases/:caseId/task-progress", async () => {
    const { getTaskProgress } = await import("./tasks");
    await getTaskProgress("case-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/task-progress", { method: "GET" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @kototsute/web test`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

`apps/web/src/app/api/tasks.ts`
```ts
import { apiFetch } from "../../features/shared/lib/api";

export type TaskProgress = {
  sharedCompletedTaskIds: string[];
  userCompletedTaskIds: string[];
};

export const getTaskProgress = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/task-progress`, { method: "GET" });
  return result.data as TaskProgress;
};

export const updateSharedTaskProgress = async (caseId: string, completedTaskIds: string[]) => {
  await apiFetch(`/v1/cases/${caseId}/task-progress/shared`, {
    method: "POST",
    body: JSON.stringify({ completedTaskIds })
  });
};

export const updateMyTaskProgress = async (caseId: string, completedTaskIds: string[]) => {
  await apiFetch(`/v1/cases/${caseId}/task-progress/me`, {
    method: "POST",
    body: JSON.stringify({ completedTaskIds })
  });
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @kototsute/web test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/tasks.ts apps/web/src/app/api/tasks.test.ts

git commit -m "タスク進捗APIクライアントを追加"
```

---

### Task 5: ケース詳細に「タスク」タブを追加

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/styles/caseDetailPage.module.css`
- Test: `apps/web/src/app/pages/CaseDetailPage.test.ts`

**Step 1: Write the failing test**

```ts
it("renders tasks tab", async () => {
  const { default: CaseDetailPage } = await import("./CaseDetailPage");
  const html = renderToString(<CaseDetailPage />);
  expect(html).toContain("タスク");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @kototsute/web test`
Expected: FAIL (no tasks tab)

**Step 3: Write minimal implementation**

- `TabKey` に `tasks` を追加
- `tabItems` に `タスク` を追加
- 新しい state を追加し、`getTaskProgress` を読み込み
- タスク一覧を描画（`todoMaster` を使用）
- 共有/個人で `updateSharedTaskProgress` / `updateMyTaskProgress` を呼ぶ

例:

```ts
import { todoMaster } from "@kototsute/tasks";
import { getTaskProgress, updateMyTaskProgress, updateSharedTaskProgress } from "../api/tasks";
```

レンダリングでは `todoMaster.shared` と `todoMaster.owner/heir` を出し分ける。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @kototsute/web test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/styles/caseDetailPage.module.css apps/web/src/app/pages/CaseDetailPage.test.ts

git commit -m "ケース詳細にタスクタブを追加"
```

---

### Task 6: Firestore ルール更新

**Files:**
- Modify: `firestore.rules`

**Step 1: Write the failing test**

(テストが無い場合は省略)

**Step 2: Implement**

`cases/{caseId}/taskProgress` をケース関係者に限定で読み書き許可:

```rules
match /cases/{caseId}/taskProgress/{docId} {
  allow read, write: if request.auth != null &&
    (request.auth.uid == get(/databases/$(database)/documents/cases/$(caseId)).data.ownerUid ||
     request.auth.uid in get(/databases/$(database)/documents/cases/$(caseId)).data.memberUids);
}

match /cases/{caseId}/taskProgress/users/{uid} {
  allow read: if request.auth != null &&
    (request.auth.uid == get(/databases/$(database)/documents/cases/$(caseId)).data.ownerUid ||
     request.auth.uid in get(/databases/$(database)/documents/cases/$(caseId)).data.memberUids);
  allow write: if request.auth != null && request.auth.uid == uid &&
    (request.auth.uid == get(/databases/$(database)/documents/cases/$(caseId)).data.ownerUid ||
     request.auth.uid in get(/databases/$(database)/documents/cases/$(caseId)).data.memberUids);
}
```

**Step 3: Commit**

```bash
git add firestore.rules

git commit -m "タスク進捗のルールを追加"
```

---

### Task 7: 全体テスト

**Step 1: Run tests**

```bash
pnpm --filter @kototsute/tasks test
pnpm --filter @kototsute/web test
pnpm --filter @kototsute/functions test
```

Expected: PASS

**Step 2: Run build**

```bash
task functions:build
```

Expected: success

**Step 3: Commit (if needed)**

(未コミットがあればまとめてコミット)

---

## Notes
- 進捗保存は「完了IDのみ」。Todo マスター変更に強い。
- `requiresWallet` はUIで注意バッジ表示に使う。
- ケース進捗には影響しない（UIの補助機能）。
