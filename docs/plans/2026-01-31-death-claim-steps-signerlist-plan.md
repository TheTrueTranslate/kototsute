# 死亡診断書ステップ化 + 相続開始ゲート + SignerListSet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 死亡診断書の差し戻し対応とステップ表示を追加し、死亡確定後の相続開始を相続人ウォレット検証でブロックしつつ SignerListSet を自動設定できる状態にする。

**Architecture:** 死亡診断書は `ADMIN_REJECTED` と再提出を追加し、Web/管理者UIでステップ表示とOK/NGを提供する。相続開始は `asset-lock/start` の入り口で相続人ウォレット検証と SignerListSet 自動実行を行い、失敗時はブロックする。相続人上限はケース内招待（pending+accepted）で30人までとする。

**Tech Stack:** Hono + Firebase Functions/Firestore + XRPL client, React + Vite, Vitest

---

### Task 1: Functions - 死亡診断書の差し戻し/再提出 API

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing tests**

```ts
it("allows admin to reject death claim", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  const db = getFirestore();
  const caseId = "case_1";
  await db.collection("cases").doc(caseId).set({ caseId, ownerUid: "owner_1", memberUids: ["owner_1", "heir_1"] });
  await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").set({
    submittedByUid: "heir_1",
    status: "SUBMITTED",
    createdAt: new Date("2024-01-01T00:00:00.000Z")
  });

  const req = authedReq("admin_1", "admin@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/death-claims/claim_1/admin-reject`,
    body: { note: "差し戻し理由" }
  });
  const token = String(req.headers?.Authorization ?? "").replace("Bearer ", "");
  authTokens.set(token, { uid: "admin_1", email: "admin@example.com", admin: true });

  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(200);
  const snap = await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").get();
  expect(snap.data()?.status).toBe("ADMIN_REJECTED");
  expect(snap.data()?.adminReview?.status).toBe("REJECTED");
  expect(snap.data()?.adminReview?.note).toBe("差し戻し理由");
});

it("allows heir to resubmit rejected death claim", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  const db = getFirestore();
  const caseId = "case_1";
  await db.collection("cases").doc(caseId).set({ caseId, ownerUid: "owner_1", memberUids: ["owner_1", "heir_1"] });
  await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").set({
    submittedByUid: "heir_1",
    status: "ADMIN_REJECTED",
    adminReview: { status: "REJECTED", note: "差し戻し", reviewedByUid: "admin_1", reviewedAt: new Date() },
    createdAt: new Date("2024-01-01T00:00:00.000Z")
  });

  const req = authedReq("heir_1", "heir@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/death-claims/claim_1/resubmit`
  });
  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(200);
  const snap = await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").get();
  expect(snap.data()?.status).toBe("SUBMITTED");
  expect(snap.data()?.adminReview ?? null).toBeNull();
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/functions test -- handler.test.ts`  
Expected: FAIL (404 or validation error for new endpoints)

**Step 3: Write minimal implementation**

```ts
// cases.ts
app.post(":caseId/death-claims/:claimId/admin-reject", async (c) => {
  const auth = c.get("auth");
  if (!auth.admin) return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  const caseId = c.req.param("caseId");
  const claimId = c.req.param("claimId");
  const body = await c.req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  const db = getFirestore();
  const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
  const claimSnap = await claimRef.get();
  if (!claimSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Claim not found");
  const now = c.get("deps").now();
  await claimRef.set(
    {
      status: "ADMIN_REJECTED",
      adminReview: { status: "REJECTED", note, reviewedByUid: auth.uid, reviewedAt: now },
      updatedAt: now
    },
    { merge: true }
  );
  return jsonOk(c);
});

app.post(":caseId/death-claims/:claimId/resubmit", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const claimId = c.req.param("claimId");
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  const caseData = caseSnap.data() ?? {};
  const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
  if (caseData.ownerUid === auth.uid || !memberUids.includes(auth.uid)) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }
  const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
  const claimSnap = await claimRef.get();
  if (!claimSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Claim not found");
  if (claimSnap.data()?.status !== "ADMIN_REJECTED") {
    return jsonError(c, 400, "VALIDATION_ERROR", "差し戻し中のみ再提出できます");
  }
  const now = c.get("deps").now();
  await claimRef.set({ status: "SUBMITTED", adminReview: null, updatedAt: now }, { merge: true });
  const confirmationsSnap = await claimRef.collection("confirmations").get();
  await Promise.all(confirmationsSnap.docs.map((doc) => doc.ref.delete()));
  return jsonOk(c);
});
```

**Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/functions test -- handler.test.ts`  
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`  
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "死亡診断書の差し戻しと再提出APIを追加"
```

---

### Task 2: Web - 死亡診断書 API拡張 + ステップUI + 再提出

**Files:**
- Modify: `apps/web/src/app/api/death-claims.ts`
- Modify: `apps/web/src/app/api/death-claims.test.ts`
- Modify: `apps/web/src/app/pages/DeathClaimsPage.tsx`
- Modify: `apps/web/src/styles/deathClaimsPage.module.css`
- Modify: `apps/web/src/app/pages/DeathClaimsPage.test.ts`

**Step 1: Write the failing tests**

```ts
// death-claims.test.ts
it("calls resubmit endpoint", async () => {
  const { resubmitDeathClaim } = await import("./death-claims");
  const { apiFetch } = await import("../../features/shared/lib/api");
  await resubmitDeathClaim("case-1", "claim-1");
  expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/death-claims/claim-1/resubmit", {
    method: "POST"
  });
});
```

```ts
// DeathClaimsPage.test.ts
it("renders rejected state with resubmit action", async () => {
  const api = await import("../api/death-claims");
  vi.mocked(api.getDeathClaim).mockResolvedValueOnce({
    claim: {
      claimId: "claim-1",
      status: "ADMIN_REJECTED",
      submittedByUid: "heir_1",
      adminReview: { status: "REJECTED", note: "差し戻し理由" }
    },
    files: [],
    confirmationsCount: 0,
    requiredCount: 0,
    confirmedByMe: false
  } as any);
  const html = await render();
  expect(html).toContain("差し戻し");
  expect(html).toContain("再提出");
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/web test -- src/app/api/death-claims.test.ts src/app/pages/DeathClaimsPage.test.ts`  
Expected: FAIL (resubmit not found / UI not showing)

**Step 3: Write minimal implementation**

```ts
// death-claims.ts
export type DeathClaimData = {
  claimId: string;
  status: "SUBMITTED" | "ADMIN_APPROVED" | "ADMIN_REJECTED" | "CONFIRMED";
  submittedByUid: string;
  adminReview?: { status: "APPROVED" | "REJECTED"; note?: string | null } | null;
};

export const resubmitDeathClaim = async (caseId: string, claimId: string) => {
  await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/resubmit`, { method: "POST" });
};
```

```tsx
// DeathClaimsPage.tsx (抜粋)
const stepItems = [
  { id: "submit", label: "提出・ファイル追加" },
  { id: "review", label: "運営確認" },
  { id: "consent", label: "相続人同意" },
  { id: "confirmed", label: "確定" }
];
const isRejected = claim?.claim?.status === "ADMIN_REJECTED";
```

**Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/web test -- src/app/api/death-claims.test.ts src/app/pages/DeathClaimsPage.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/death-claims.ts apps/web/src/app/api/death-claims.test.ts apps/web/src/app/pages/DeathClaimsPage.tsx apps/web/src/styles/deathClaimsPage.module.css apps/web/src/app/pages/DeathClaimsPage.test.ts
git commit -m "死亡診断書の差し戻しとステップUIを追加"
```

---

### Task 3: Admin App - OK/NG UIとAPI

**Files:**
- Modify: `apps/admin/src/api/death-claims.ts`
- Create: `apps/admin/src/api/death-claims.test.ts`
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`
- Modify: `apps/admin/src/App.tsx` (必要なら)

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: {} }))
}));

describe("admin death-claims api", () => {
  it("calls reject endpoint", async () => {
    const { rejectDeathClaim } = await import("./death-claims");
    const { apiFetch } = await import("../lib/api");
    await rejectDeathClaim("case-1", "claim-1", { note: "NG" });
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/death-claims/claim-1/admin-reject", {
      method: "POST",
      body: JSON.stringify({ note: "NG" })
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/admin test -- src/api/death-claims.test.ts`  
Expected: FAIL (rejectDeathClaim not found)

**Step 3: Write minimal implementation**

```ts
// death-claims.ts
export const rejectDeathClaim = async (
  caseId: string,
  claimId: string,
  input: { note?: string | null }
) => {
  await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/admin-reject`, {
    method: "POST",
    body: JSON.stringify({ note: input.note ?? null })
  });
};
```

```tsx
// ClaimDetailPage.tsx
const [rejecting, setRejecting] = useState(false);
const [rejectNote, setRejectNote] = useState("");
const handleReject = async () => {
  if (!caseId || !claimId) return;
  setRejecting(true);
  setError(null);
  try {
    await rejectDeathClaim(caseId, claimId, { note: rejectNote });
    await load();
  } catch (err: any) {
    setError(err?.message ?? "差し戻しに失敗しました");
  } finally {
    setRejecting(false);
  }
};
```

**Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/admin test -- src/api/death-claims.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add apps/admin/src/api/death-claims.ts apps/admin/src/api/death-claims.test.ts apps/admin/src/pages/ClaimDetailPage.tsx
git commit -m "管理者の差し戻し操作を追加"
```

---

### Task 4: Functions - 相続人上限30人（招待中含む）

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing tests**

```ts
it("rejects case invite when heir limit exceeded", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  const db = getFirestore();
  const caseId = "case_1";
  await db.collection("cases").doc(caseId).set({ caseId, ownerUid: "owner_1" });
  const invitesRef = db.collection(`cases/${caseId}/invites`);
  for (let i = 0; i < 30; i++) {
    await invitesRef.doc(`invite_${i}`).set({ email: `user${i}@example.com`, status: "pending" });
  }

  const req = authedReq("owner_1", "owner@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/invites`,
    body: { email: "extra@example.com", relationLabel: "family" }
  });
  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(400);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/functions test -- handler.test.ts`  
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// cases.ts (case invite create)
const countSnap = await invitesCollection
  .where("status", "in", ["pending", "accepted"])
  .get();
if (countSnap.size >= 30) {
  return jsonError(c, 400, "HEIR_LIMIT_REACHED", "相続人は30人までです");
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/functions test -- handler.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "相続人の招待上限を追加"
```

---

### Task 5: Functions - 相続開始ゲート（ウォレット検証）+ SignerListSet 自動化

**Files:**
- Modify: `apps/functions/src/api/utils/xrpl-wallet.ts`
- Modify: `apps/functions/src/api/utils/xrpl-wallet.test.ts`
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`
- Modify: `apps/functions/.env.example`

**Step 1: Write the failing tests**

```ts
// xrpl-wallet.test.ts
it("submits signer list set", async () => {
  const { sendSignerListSet } = await import("./xrpl-wallet");
  const result = await sendSignerListSet({
    fromSeed: "sSeed",
    fromAddress: "rFrom",
    signerEntries: [{ account: "rSigner", weight: 1 }],
    quorum: 2
  });
  expect(result.txHash).toBe("SIGNED_HASH");
});
```

```ts
// handler.test.ts
it("blocks asset lock start when heir wallet not verified after death confirmed", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  const db = getFirestore();
  const caseId = "case_1";
  await db.collection("cases").doc(caseId).set({
    caseId,
    ownerUid: "owner_1",
    memberUids: ["owner_1", "heir_1", "heir_2"],
    stage: "IN_PROGRESS"
  });
  await db.collection(`cases/${caseId}/heirWallets`).doc("heir_1").set({
    address: "rAddr1",
    verificationStatus: "VERIFIED"
  });
  await db.collection(`cases/${caseId}/heirWallets`).doc("heir_2").set({
    address: "rAddr2",
    verificationStatus: null
  });

  const res = createRes();
  await handler(
    authedReq("owner_1", "owner@example.com", {
      method: "POST",
      path: `/v1/cases/${caseId}/asset-lock/start`,
      body: { method: "B" }
    }) as any,
    res as any
  );

  expect(res.statusCode).toBe(400);
  expect(res.body?.code).toBe("WALLET_NOT_VERIFIED");
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/functions test -- handler.test.ts src/api/utils/xrpl-wallet.test.ts`  
Expected: FAIL (sendSignerListSet missing / gate missing)

**Step 3: Write minimal implementation**

```ts
// xrpl-wallet.ts
export const sendSignerListSet = async (input: {
  fromSeed: string;
  fromAddress: string;
  signerEntries: Array<{ account: string; weight: number }>;
  quorum: number;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(input.fromSeed);
    const prepared = await client.autofill({
      TransactionType: "SignerListSet",
      Account: input.fromAddress,
      SignerQuorum: input.quorum,
      SignerEntries: input.signerEntries.map((entry) => ({
        SignerEntry: { Account: entry.account, SignerWeight: entry.weight }
      }))
    });
    const signed = wallet.sign(prepared);
    const result = await client.submit(signed.tx_blob);
    const engineResult = result?.result?.engine_result;
    if (engineResult && !["tesSUCCESS", "terQUEUED"].includes(engineResult)) {
      throw new Error(`XRPL submit failed: ${engineResult}`);
    }
    return { txHash: signed.hash ?? result?.result?.tx_json?.hash ?? "" };
  } finally {
    await client.disconnect();
  }
};
```

```ts
// cases.ts (asset-lock/start 追加)
const systemSigner = process.env.XRPL_SYSTEM_SIGNER_ADDRESS;
if (caseData.stage === "IN_PROGRESS") {
  const heirUids = memberUids.filter((uid) => uid !== caseData.ownerUid);
  const walletSnaps = await Promise.all(
    heirUids.map((uid) => db.collection(`cases/${caseId}/heirWallets`).doc(uid).get())
  );
  const unverified = walletSnaps.filter(
    (snap) => snap.data()?.verificationStatus !== "VERIFIED"
  );
  if (unverified.length > 0) {
    return jsonError(c, 400, "WALLET_NOT_VERIFIED", "相続人ウォレットが未検証です");
  }
  if (!systemSigner) {
    return jsonError(c, 500, "SYSTEM_SIGNER_MISSING", "システム署名者が未設定です");
  }
  const quorum = heirUids.length + (Math.floor(heirUids.length / 2) + 1);
  const signerEntries = [
    { account: systemSigner, weight: heirUids.length },
    ...walletSnaps.map((snap) => ({ account: snap.data()?.address, weight: 1 }))
  ];
  await sendSignerListSet({ fromSeed: wallet.seed, fromAddress: wallet.address, signerEntries, quorum });
  await caseRef.collection("signerList").doc("state").set({
    status: "SET",
    quorum,
    entries: signerEntries,
    updatedAt: now,
    createdAt: now
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm -C apps/functions test -- handler.test.ts src/api/utils/xrpl-wallet.test.ts`  
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`  
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/utils/xrpl-wallet.ts apps/functions/src/api/utils/xrpl-wallet.test.ts apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts apps/functions/.env.example
git commit -m "相続開始ゲートとSignerListSetを追加"
```

---

### Task 6: Web/管理画面の最終確認

**Step 1: Run web tests**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts`  
Expected: PASS

**Step 2: Run functions tests**

Run: `pnpm -C apps/functions test -- handler.test.ts`  
Expected: PASS

**Step 3: Build**

Run: `task functions:build`  
Expected: tsc completes

