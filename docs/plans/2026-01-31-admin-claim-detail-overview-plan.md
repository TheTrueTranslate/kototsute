# 管理画面 申請詳細の概要表示 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面の申請詳細で、提出ファイルとケース情報の概要を表示できるようにする。

**Architecture:** Functions の admin detail API に case 情報とファイル拡張項目を追加し、admin 側 API/画面はそのまま表示に反映する。

**Tech Stack:** Firebase Functions (Hono), Firestore, React (Vite), TypeScript, Vitest

---

### Task 1: admin detail API に case 情報と file 拡張を追加

**Files:**
- Modify: `apps/functions/src/api/routes/admin.ts`
- Test: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

`apps/functions/src/api/handler.test.ts` に admin detail のレスポンス拡張を追加。

```ts
it("returns death claim detail with case summary and file metadata", async () => {
  const db = getFirestore();
  await db.collection("cases").doc("case_1").set({
    ownerDisplayName: "山田",
    stage: "WAITING",
    assetLockStatus: "LOCKED",
    memberUids: ["u1", "u2"],
    createdAt: new Date("2024-01-01T00:00:00.000Z")
  });
  const claimRef = db.collection("cases/case_1/deathClaims").doc("claim_1");
  await claimRef.set({ submittedByUid: "u2", status: "SUBMITTED" });
  await claimRef.collection("files").doc("file_1").set({
    fileName: "doc.pdf",
    contentType: "application/pdf",
    size: 1000,
    storagePath: "cases/case_1/death-claims/claim_1/file_1",
    uploadedByUid: "u2",
    createdAt: new Date("2024-01-02T00:00:00.000Z")
  });

  const req = authedReq("admin_1", "admin@example.com", {
    path: "/v1/admin/death-claims/case_1/claim_1"
  });
  authTokens.set("token_admin_1", { uid: "admin_1", email: "admin@example.com", admin: true });

  const res = await run(req);
  expect(res.statusCode).toBe(200);
  expect(res.body?.data?.case?.ownerDisplayName).toBe("山田");
  expect(res.body?.data?.case?.memberCount).toBe(2);
  expect(res.body?.data?.files?.[0]?.storagePath).toContain("cases/case_1");
  expect(res.body?.data?.files?.[0]?.uploadedByUid).toBe("u2");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL (case / files fields missing)

**Step 3: Write minimal implementation**

- `apps/functions/src/api/routes/admin.ts` で `caseId` の `cases/{caseId}` を取得し `case` を返す。
- `files` の各要素に `createdAt` / `storagePath` / `uploadedByUid` を含めて返す。
- `memberCount` は `memberUids` の length（配列でない場合は 0）。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/admin.ts apps/functions/src/api/handler.test.ts

git commit -m "管理画面の申請詳細にケース概要を追加"
```

---

### Task 2: admin 側 API 型を拡張

**Files:**
- Modify: `apps/admin/src/api/death-claims.ts`
- Test: `apps/admin/src/api/death-claims.test.ts`

**Step 1: Write the failing test**

`apps/admin/src/api/death-claims.test.ts` に detail の型拡張を確認するテストを追加。

```ts
it("returns detail with case and file metadata", async () => {
  apiFetch.mockResolvedValueOnce({
    data: {
      claim: { claimId: "claim_1", status: "SUBMITTED", submittedByUid: "u1" },
      case: {
        caseId: "case_1",
        ownerDisplayName: "山田",
        stage: "WAITING",
        assetLockStatus: "LOCKED",
        memberCount: 2,
        createdAt: "2024-01-01T00:00:00.000Z"
      },
      files: [
        {
          fileId: "file_1",
          fileName: "doc.pdf",
          contentType: "application/pdf",
          size: 1000,
          storagePath: "cases/case_1/death-claims/claim_1/file_1",
          uploadedByUid: "u1",
          createdAt: "2024-01-02T00:00:00.000Z"
        }
      ]
    }
  });

  const result = await getDeathClaimDetail("case_1", "claim_1");
  expect(result.case.ownerDisplayName).toBe("山田");
  expect(result.files[0].storagePath).toContain("cases/");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/admin test -- src/api/death-claims.test.ts`
Expected: FAIL (型不足)

**Step 3: Write minimal implementation**

- `AdminDeathClaimDetail` に `case` と拡張 `files` を追加。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/admin test -- src/api/death-claims.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/admin/src/api/death-claims.ts apps/admin/src/api/death-claims.test.ts

git commit -m "申請詳細API型を拡張"
```

---

### Task 3: 管理画面の申請詳細 UI を拡張

**Files:**
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`

**Step 1: Write the failing test**

新規の UI テストは最小にし、`ClaimDetailPage` の表示に case 情報が含まれることを確認。

```ts
// 既存のページテストが無いので、必要なら追加
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/admin test`
Expected: FAIL (テスト追加時)

**Step 3: Write minimal implementation**

- 「ケース概要」セクションを追加。
- `detail.case` があれば表示、無ければ「取得できません」を表示。
- 提出ファイルに `createdAt` / `uploadedByUid` / `storagePath` を追加表示（概要レベル）。

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/admin test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/admin/src/pages/ClaimDetailPage.tsx

git commit -m "申請詳細に概要表示を追加"
```

---

### Task 4: Functions build 実行

**Step 1: Run build**

Run: `task functions:build`
Expected: PASS

**Step 2: Commit**

ビルド成果物はコミットしない。
