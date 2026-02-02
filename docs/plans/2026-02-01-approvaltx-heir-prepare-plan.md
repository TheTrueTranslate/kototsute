# ApprovalTx相続人準備 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面からApprovalTx作成を外し、相続人画面で「同意の準備」を行い、全員の受取用ウォレット確認済みを保証してから準備できるようにする。

**Architecture:** Functionsに相続人用prepareエンドポイントを追加し、相続人画面から呼び出す。管理画面のApprovalTx作成API/UIとadmin用prepareルートを削除する。画面側は相続人一覧のウォレット確認状況を集計し、準備ボタンの活性/案内を切り替える。

**Tech Stack:** React (Vite), Hono (Functions), Firestore, Vitest

**Constraints:** このリポジトリではgit worktreeを使わない。

---

### Task 1: Functions - 相続人prepareエンドポイントのテスト追加

**Files:**
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("allows heir to prepare approval tx", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });
  process.env.XRPL_SYSTEM_SIGNER_ADDRESS = "rSystem";
  process.env.XRPL_SYSTEM_SIGNER_SEED = "sSystem";
  process.env.XRPL_VERIFY_ADDRESS = "rVerify";

  const db = getFirestore();
  const caseId = "case_approval";
  await db.collection("cases").doc(caseId).set({
    caseId,
    ownerUid: "owner_1",
    memberUids: ["owner_1", "heir_1"],
    stage: "IN_PROGRESS",
    assetLockStatus: "LOCKED"
  });
  await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
    wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
  });
  await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
    address: "rHeir",
    verificationStatus: "VERIFIED"
  });

  const req = authedReq("heir_1", "heir@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/signer-list/prepare`
  });
  const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
  authTokens.set(token, { uid: "heir_1", email: "heir@example.com" });

  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(200);
  const approvalSnap = await db
    .collection(`cases/${caseId}/signerList`)
    .doc("approvalTx")
    .get();
  expect(approvalSnap.exists).toBe(true);
});

it("rejects prepare when heir wallets are unverified", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });
  process.env.XRPL_SYSTEM_SIGNER_ADDRESS = "rSystem";
  process.env.XRPL_SYSTEM_SIGNER_SEED = "sSystem";
  process.env.XRPL_VERIFY_ADDRESS = "rVerify";

  const db = getFirestore();
  const caseId = "case_approval_unverified";
  await db.collection("cases").doc(caseId).set({
    caseId,
    ownerUid: "owner_1",
    memberUids: ["owner_1", "heir_1"],
    stage: "IN_PROGRESS",
    assetLockStatus: "LOCKED"
  });
  await db.collection(`cases/${caseId}/assetLock`).doc("state").set({
    wallet: { address: "rLock", seedEncrypted: encryptPayload("sLock") }
  });
  await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
    address: "rHeir",
    verificationStatus: "PENDING"
  });

  const req = authedReq("heir_1", "heir@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/signer-list/prepare`
  });
  const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
  authTokens.set(token, { uid: "heir_1", email: "heir@example.com" });

  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(400);
  expect(res.body?.code).toBe("HEIR_WALLET_UNVERIFIED");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "prepare approval tx"`
Expected: FAIL (404 NOT_FOUND or route missing)

---

### Task 2: Functions - 相続人prepareルートを実装

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`

**Step 1: Write minimal implementation**

```ts
app.post(":caseId/signer-list/prepare", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) {
    return jsonError(c, 404, "NOT_FOUND", "Case not found");
  }
  const caseData = caseSnap.data() ?? {};
  const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
  if (caseData.ownerUid === auth.uid || !memberUids.includes(auth.uid)) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }
  if (caseData.stage !== "IN_PROGRESS") {
    return jsonError(c, 400, "NOT_READY", "相続中のみ準備できます");
  }

  const heirUids = memberUids.filter((uid) => uid !== caseData.ownerUid);
  if (heirUids.length === 0) {
    return jsonError(c, 400, "HEIR_MISSING", "相続人が未登録です");
  }
  const walletSnaps = await Promise.all(
    heirUids.map((uid) => caseRef.collection("heirWallets").doc(uid).get())
  );
  const unverified = walletSnaps.filter((snap) => {
    const data = snap.data() ?? {};
    const address = typeof data.address === "string" ? data.address : "";
    return !address || data.verificationStatus !== "VERIFIED";
  });
  if (unverified.length > 0) {
    return jsonError(
      c,
      400,
      "HEIR_WALLET_UNVERIFIED",
      "相続人の受取用ウォレットが未確認です"
    );
  }

  const now = c.get("deps").now();
  const result = await prepareInheritanceExecution({ caseRef, caseData, now });
  if (result.status === "SKIPPED") {
    switch (result.reason) {
      case "NOT_IN_PROGRESS":
        return jsonError(c, 400, "NOT_READY", "相続中のみ準備できます");
      case "LOCK_WALLET_MISSING":
        return jsonError(c, 400, "VALIDATION_ERROR", "分配用ウォレットが未設定です");
      case "HEIR_WALLET_UNVERIFIED":
        return jsonError(
          c,
          400,
          "HEIR_WALLET_UNVERIFIED",
          "相続人の受取用ウォレットが未確認です"
        );
      case "HEIR_MISSING":
        return jsonError(c, 400, "HEIR_MISSING", "相続人が未登録です");
      default:
        return jsonError(c, 400, "NOT_READY", "同意の準備が完了していません");
    }
  }
  if (result.status === "FAILED") {
    switch (result.reason) {
      case "SYSTEM_SIGNER_MISSING":
      case "SYSTEM_SIGNER_SEED_MISSING":
        return jsonError(c, 500, "SYSTEM_SIGNER_MISSING", "システム署名者が未設定です");
      case "VERIFY_ADDRESS_MISSING":
        return jsonError(c, 500, "VERIFY_ADDRESS_MISSING", "送金先が未設定です");
      case "SIGNER_LIST_FAILED":
        return jsonError(c, 500, "SIGNER_LIST_FAILED", "署名準備に失敗しました");
      default:
        return jsonError(c, 500, "PREPARE_FAILED", "同意の準備に失敗しました");
    }
  }

  return jsonOk(c, result.approvalTx);
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts -t "prepare approval tx"`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "相続人のApprovalTx準備APIを追加"
```

---

### Task 3: Functions/Admin - 運営側prepareを削除

**Files:**
- Modify: `apps/functions/src/api/routes/admin.ts`
- Modify: `apps/functions/src/api/routes/cases.ts`
- Delete: `apps/admin/src/api/signer-list.ts`
- Delete: `apps/admin/src/api/signer-list.test.ts`
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`

**Step 1: Remove admin prepare route and auto-prepare on admin approve**

- `apps/functions/src/api/routes/admin.ts` から `/cases/:caseId/signer-list/prepare` を削除
- `apps/functions/src/api/routes/cases.ts` の `admin-approve` 内 `prepareInheritanceExecution` 呼び出しを削除
- 使わなくなるimportを削除

**Step 2: Remove admin UI/API**

- `apps/admin/src/pages/ClaimDetailPage.tsx` からApprovalTx生成セクションと関連state/handlerを削除
- `apps/admin/src/api/signer-list.ts` とテストを削除

**Step 3: Run tests**

Run: `pnpm -C apps/admin test --`
Expected: PASS

Run: `pnpm -C apps/functions test -- handler.test.ts -t "admin approve"`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/functions/src/api/routes/admin.ts apps/functions/src/api/routes/cases.ts
git add apps/admin/src/pages/ClaimDetailPage.tsx
git rm apps/admin/src/api/signer-list.ts apps/admin/src/api/signer-list.test.ts
git commit -m "運営側のApprovalTx作成を削除"
```

---

### Task 4: Web API - 相続人prepare呼び出し追加

**Files:**
- Modify: `apps/web/src/app/api/signer-list.ts`
- Modify: `apps/web/src/app/api/signer-list.test.ts`

**Step 1: Write the failing test**

```ts
it("prepares approval tx", async () => {
  const { prepareApprovalTx } = await import("./signer-list");
  await prepareApprovalTx("case-1");
  expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/signer-list/prepare", {
    method: "POST"
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- signer-list.test.ts`
Expected: FAIL (function missing)

**Step 3: Write minimal implementation**

```ts
export type PrepareApprovalTxSummary = {
  memo: string;
  fromAddress: string;
  destination: string;
  amountDrops: string;
};

export const prepareApprovalTx = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list/prepare`, {
    method: "POST"
  });
  return result.data as PrepareApprovalTxSummary;
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- signer-list.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/signer-list.ts apps/web/src/app/api/signer-list.test.ts
git commit -m "相続人の準備APIを追加"
```

---

### Task 5: Web UI - 相続同意の準備ボタンと案内を追加

**Files:**
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/styles/caseDetailPage.module.css`
- Modify: `apps/web/src/app/pages/CaseDetailPage.test.ts`

**Step 1: Write the failing tests**

```ts
it("shows prepare guidance when some heirs are unverified", async () => {
  authUser = { uid: "heir" };
  searchParams = new URLSearchParams("tab=death-claims");
  caseHeirsData = [
    {
      inviteId: "invite-1",
      email: "heir1@example.com",
      relationLabel: "長男",
      relationOther: null,
      acceptedByUid: "heir_1",
      acceptedAt: "2024-01-02",
      walletStatus: "PENDING"
    }
  ];

  const html = await render({
    initialIsOwner: false,
    initialHeirs: caseHeirsData,
    initialCaseData: {
      caseId: "case-1",
      ownerUid: "owner",
      ownerDisplayName: "山田",
      stage: "IN_PROGRESS",
      assetLockStatus: "LOCKED",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01"
    }
  });
  expect(html).toContain("相続人の受取用ウォレットが全員分確認済みになると準備できます");
  expect(html).toContain("未確認: 1人");
});

it("shows prepare button when all heirs are verified", async () => {
  authUser = { uid: "heir" };
  searchParams = new URLSearchParams("tab=death-claims");
  caseHeirsData = [
    {
      inviteId: "invite-1",
      email: "heir1@example.com",
      relationLabel: "長男",
      relationOther: null,
      acceptedByUid: "heir_1",
      acceptedAt: "2024-01-02",
      walletStatus: "VERIFIED"
    }
  ];

  const html = await render({
    initialIsOwner: false,
    initialHeirs: caseHeirsData,
    initialCaseData: {
      caseId: "case-1",
      ownerUid: "owner",
      ownerDisplayName: "山田",
      stage: "IN_PROGRESS",
      assetLockStatus: "LOCKED",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01"
    }
  });
  expect(html).toContain("相続同意の準備を始める");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts`
Expected: FAIL (UI未実装)

**Step 3: Write minimal implementation**

- `CaseDetailPage.tsx` に準備状態の判定とボタン/案内を追加
- `prepareApprovalTx` を呼び出すハンドラと、エラー文言のマッピングを追加
- `resolveInheritanceNextAction` の「準備中」説明文を「準備を始めてください」に更新

```ts
const unverifiedHeirCount = heirs.filter((heir) => heir.walletStatus !== "VERIFIED").length;
const totalHeirCount = heirs.length;
const canPrepareApproval =
  caseData?.stage === "IN_PROGRESS" &&
  signerStatusKey !== "SET" &&
  totalHeirCount > 0 &&
  unverifiedHeirCount === 0;

const prepareDisabledReason = useMemo(() => {
  if (!caseData) return "ケース情報が取得できません。";
  if (caseData.stage !== "IN_PROGRESS") return "相続中になると準備できます。";
  if (signerStatusKey === "FAILED") return "同意の準備に失敗しました。運営へご連絡ください。";
  if (signerStatusKey === "SET") return "同意の準備は完了しています。";
  if (totalHeirCount === 0) return "相続人が登録されていないため準備できません。";
  if (unverifiedHeirCount > 0) {
    return `相続人の受取用ウォレットが全員分確認済みになると準備できます。未確認: ${unverifiedHeirCount}人`;
  }
  return null;
}, [caseData, signerStatusKey, totalHeirCount, unverifiedHeirCount]);

const handlePrepareApproval = async () => {
  if (!caseId) return;
  setPrepareLoading(true);
  setPrepareError(null);
  setPrepareSuccess(null);
  try {
    await prepareApprovalTx(caseId);
    setPrepareSuccess("同意の準備が完了しました。署名に進んでください。");
    await fetchSignerList();
  } catch (err: any) {
    const code = err?.data?.code;
    if (code === "HEIR_WALLET_UNVERIFIED" || code === "WALLET_NOT_VERIFIED") {
      setPrepareError("相続人の受取用ウォレットが全員分確認済みになると準備できます。");
    } else if (code === "HEIR_MISSING") {
      setPrepareError("相続人が登録されていないため準備できません。");
    } else if (code === "NOT_READY") {
      setPrepareError("相続中になると準備できます。");
    } else {
      setPrepareError(err?.message ?? "同意の準備に失敗しました");
    }
  } finally {
    setPrepareLoading(false);
  }
};
```

UI挿入位置: 「相続実行の同意」見出し直下に以下を追加。

```tsx
<div className={styles.signerPrepare}>
  <div className={styles.signerPrepareTitle}>同意の準備</div>
  <div className={styles.signerPrepareHint}>
    相続人の同意を進めるために、署名対象を作成します。
  </div>
  <div className={styles.signerPrepareActions}>
    <Button
      type="button"
      onClick={handlePrepareApproval}
      disabled={!canPrepareApproval || prepareLoading}
    >
      {prepareLoading ? "準備中..." : "相続同意の準備を始める"}
    </Button>
  </div>
  {prepareDisabledReason ? (
    <div className={styles.signerPrepareNote}>{prepareDisabledReason}</div>
  ) : null}
</div>
```

- `caseDetailPage.module.css` に `signerPrepare*` を追加

```css
.signerPrepare {
  @apply grid gap-2 rounded-xl border border-border/60 bg-background px-3 py-3;
}
.signerPrepareTitle {
  @apply text-body-sm font-medium text-foreground;
}
.signerPrepareHint {
  @apply text-meta text-muted-foreground;
}
.signerPrepareActions {
  @apply flex flex-wrap items-center gap-2;
}
.signerPrepareNote {
  @apply text-body-sm text-muted-foreground;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/CaseDetailPage.tsx apps/web/src/styles/caseDetailPage.module.css apps/web/src/app/pages/CaseDetailPage.test.ts
git commit -m "相続同意の準備案内を追加"
```

---

### Task 6: Functions build

**Step 1: Run build**

Run: `task functions:build`
Expected: build succeeds

---

## Notes
- Functionsを変更したので `task functions:build` は必ず実行する。
- 既存のadmin ApprovalTx作成UIは削除するため、運営側のボタンは出なくなる。
