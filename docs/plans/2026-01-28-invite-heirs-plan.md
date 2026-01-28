# 相続人招待 + 入力バリデーション統合 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 相続人招待（作成/一覧/受諾/辞退）を実装し、Zod で招待・資産の入力バリデーションを共通化する。

**Architecture:** 共通バリデーションは `@kototsute/shared` に Zod スキーマとして集約し、Functions と Web で再利用する。Functions は API 入力を Zod で検証し、Firestore に招待/相続人を保存する。Web は招待フォームと受諾画面を追加し、API を経由して管理する。

**Tech Stack:** Firebase Functions, Firestore, React (Vite), React Hook Form, Zod, Vitest

---

### Task 1: 招待入力スキーマを @kototsute/shared に追加（TDD）

**Files:**
- Create: `packages/shared/src/validation/invite-schema.test.ts`
- Create: `packages/shared/src/validation/invite-schema.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`

**Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { inviteCreateSchema } from "./invite-schema";

describe("inviteCreateSchema", () => {
  it("accepts valid input", () => {
    const result = inviteCreateSchema.safeParse({
      email: "heir@example.com",
      relationLabel: "長男",
      memo: "メモ"
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = inviteCreateSchema.safeParse({
      relationLabel: "長男"
    });
    expect(result.success).toBe(false);
  });

  it("requires relationOther when relationLabel is その他", () => {
    const result = inviteCreateSchema.safeParse({
      email: "heir@example.com",
      relationLabel: "その他"
    });
    expect(result.success).toBe(false);
  });

  it("rejects memo over 400 chars", () => {
    const result = inviteCreateSchema.safeParse({
      email: "heir@example.com",
      relationLabel: "長男",
      memo: "a".repeat(401)
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm -C packages/shared test -- invite-schema.test.ts`
Expected: FAIL (module not found or schema missing)

**Step 3: Write minimal implementation**
```ts
import { z } from "zod";

export const relationOptions = [
  "配偶者",
  "事実婚",
  "長男",
  "長女",
  "次男",
  "次女",
  "子（その他）",
  "父",
  "母",
  "祖父",
  "祖母",
  "孫",
  "兄",
  "姉",
  "弟",
  "妹",
  "義父",
  "義母",
  "義兄",
  "義姉",
  "義弟",
  "義妹",
  "甥",
  "姪",
  "叔父",
  "叔母",
  "いとこ",
  "親族",
  "友人",
  "その他"
] as const;

const base = z.object({
  email: z.string().email("正しいメールアドレスを入力してください"),
  relationLabel: z.string().min(1, "関係は必須です"),
  relationOther: z.string().optional(),
  memo: z.string().max(400, "メモは400文字以内で入力してください").optional()
});

export const inviteCreateSchema = base.superRefine((values, ctx) => {
  if (values.relationLabel === "その他" && !values.relationOther?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["relationOther"],
      message: "その他の関係を入力してください"
    });
  }
});
```

**Step 4: Run test to verify it passes**
Run: `pnpm -C packages/shared test -- invite-schema.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/shared/package.json packages/shared/src/validation/invite-schema.ts packages/shared/src/validation/invite-schema.test.ts packages/shared/src/index.ts
git commit -m "招待入力のバリデーションを共有化"
```

---

### Task 2: 資産入力スキーマを @kototsute/shared に追加し Web で再利用（TDD）

**Files:**
- Create: `packages/shared/src/validation/asset-schema.test.ts`
- Create: `packages/shared/src/validation/asset-schema.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/app/pages/AssetNewPage.tsx`

**Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { assetCreateSchema } from "./asset-schema";

describe("assetCreateSchema", () => {
  it("accepts valid input", () => {
    const result = assetCreateSchema.safeParse({
      label: "自分のウォレット",
      address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing label", () => {
    const result = assetCreateSchema.safeParse({
      address: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid address", () => {
    const result = assetCreateSchema.safeParse({
      label: "X",
      address: "invalid"
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm -C packages/shared test -- asset-schema.test.ts`
Expected: FAIL (module not found or schema missing)

**Step 3: Write minimal implementation**
```ts
import { z } from "zod";
import { isXrpAddress } from "./xrp-address";

export const assetCreateSchema = z.object({
  label: z.string().min(1, "ラベルは必須です"),
  address: z
    .string()
    .min(1, "アドレスは必須です")
    .refine((value) => isXrpAddress(value), "XRPアドレスが不正です")
});
```

**Step 4: Update Web to use shared schema**
- Replace local schema in `apps/web/src/app/pages/AssetNewPage.tsx` with `assetCreateSchema` import
- Keep `FormValues` using `z.infer<typeof assetCreateSchema>`

**Step 5: Run tests/build to verify**
Run: `pnpm -C packages/shared test -- asset-schema.test.ts`
Expected: PASS

Run: `pnpm -C apps/web build`
Expected: PASS

**Step 6: Commit**
```bash
git add packages/shared/src/validation/asset-schema.ts packages/shared/src/validation/asset-schema.test.ts packages/shared/src/index.ts apps/web/src/app/pages/AssetNewPage.tsx
git commit -m "資産入力のバリデーションを共有化"
```

---

### Task 3: Functions の入力検証を Zod スキーマに置き換え（資産）

**Files:**
- Modify: `apps/functions/src/api/handler.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**
- 既存の「ラベルなし 400」テストに加え、`VALIDATION_ERROR` であることを明示
```ts
expect(res.body?.code).toBe("VALIDATION_ERROR");
```

**Step 2: Run test to verify it fails**
Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL (codeが未設定)

**Step 3: Write minimal implementation**
- `assetCreateSchema` を `@kototsute/shared` から import
- `safeParse` で検証し、失敗時は `VALIDATION_ERROR` を返す
```ts
const parsed = assetCreateSchema.safeParse({ label, address });
if (!parsed.success) {
  return json(res, 400, { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "入力が不正です" });
}
```

**Step 4: Run test to verify it passes**
Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/functions/src/api/handler.ts apps/functions/src/api/handler.test.ts
git commit -m "資産APIの入力検証をZodへ移行"
```

---

### Task 4: 招待APIの追加（Functions）

**Files:**
- Modify: `apps/functions/src/api/handler.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**
- `POST /v1/invites` が 200 を返すテストを追加
- `GET /v1/invites?scope=owner` が ownerUid で一覧取得するテストを追加
- `POST /v1/invites/:id/accept` が heirs に保存されるテストを追加
- `POST /v1/invites/:id/decline` が status=declined になるテストを追加

**Step 2: Run test to verify it fails**
Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL (route未実装)

**Step 3: Write minimal implementation**
- `inviteCreateSchema` を利用して入力検証
- `scope=owner|received` を必須にする
- Firestore に `invites` と `heirs` を保存/更新
- `ownerUid + email` の重複は 409、`declined` の場合のみ status を pending に戻す
- `accept/decline` は `invite.email === auth.email` を必須

**Step 4: Run test to verify it passes**
Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/functions/src/api/handler.ts apps/functions/src/api/handler.test.ts
git commit -m "相続人招待APIを追加"
```

---

### Task 5: 招待管理UIの追加（Web）

**Files:**
- Create: `apps/web/src/app/api/invites.ts`
- Create: `apps/web/src/app/pages/InvitesPage.tsx`
- Create: `apps/web/src/app/pages/InvitesReceivedPage.tsx`
- Create: `apps/web/src/styles/invitesPage.module.css`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx`
- Modify: `apps/web/src/components/breadcrumbs.tsx`

**Step 1: Implement API client**
- `listInvitesByOwner()` -> `GET /v1/invites?scope=owner`
- `listInvitesReceived()` -> `GET /v1/invites?scope=received`
- `createInvite()` -> `POST /v1/invites`
- `acceptInvite(inviteId)` -> `POST /v1/invites/:id/accept`
- `declineInvite(inviteId)` -> `POST /v1/invites/:id/decline`

**Step 2: Implement owner page**
- フォーム（email / relationLabel / relationOther / memo）
- 一覧（email / relation / memo / status / createdAt / acceptedAt / declinedAt）
- declined のみ「再招待」ボタン

**Step 3: Implement received page**
- ログインユーザーの招待一覧
- 受諾 / 辞退ボタン

**Step 4: Wire routing and navigation**
- `/invites` と `/invites/received` を追加
- サイドバーに「相続人招待」を追加
- パンくずに `/invites` と `/invites/received` のラベルを追加

**Step 5: Run build to verify**
Run: `pnpm -C apps/web build`
Expected: PASS

**Step 6: Commit**
```bash
git add apps/web/src/app/api/invites.ts apps/web/src/app/pages/InvitesPage.tsx apps/web/src/app/pages/InvitesReceivedPage.tsx apps/web/src/styles/invitesPage.module.css apps/web/src/app/App.tsx apps/web/src/components/app-sidebar.tsx apps/web/src/components/breadcrumbs.tsx
git commit -m "招待管理の画面を追加"
```

---

### Task 6: 動作確認（手動）

**Files:**
- N/A

**Step 1: Start dev server**
Run: `pnpm -C apps/web dev`
Expected: Vite dev server starts

**Step 2: Manual checks**
- `/invites` で招待作成ができる
- `/invites/received` で受諾/辞退ができる
- 資産登録フォームのバリデーションが従来通り動く

**Step 3: Commit (if any small fixes)**
```bash
git add .
git commit -m "招待機能の微修正"
```
