# 死亡診断書フロー Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 相続人の死亡診断書提出〜運営承認〜過半数同意で死亡確定し、相続人UIと管理者UIで運用できる状態を作る。

**Architecture:** Functions に死亡診断書 API（提出/アップロード許可/確定/運営承認/同意）を追加し、Storage へ直接アップロードする。アップロード前に Firestore で許可レコードを発行し、Storage Rules で検証する。相続人UIは `/cases/:id/death-claims`、管理者UIは `apps/admin` で未承認一覧→詳細→承認を提供する。

**Tech Stack:** Hono + Firebase Functions/Firestore/Storage, React + Vite, Firebase Auth, @superpowers:test-driven-development

---

### Task 1: Functions - deathClaims 提出/一覧 API を追加

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("creates death claim and returns latest", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  // case with owner + heir
  const caseId = "case_1";
  const db = getFirestore();
  await db.collection("cases").doc(caseId).set({
    caseId,
    ownerUid: "owner_1",
    ownerDisplayName: "Owner",
    memberUids: ["owner_1", "heir_1"],
    stage: "WAITING",
    assetLockStatus: "LOCKED",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const submitReq: MockReq = authedReq("heir_1", "heir@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/death-claims`
  });
  const submitRes = createRes();
  await handler(submitReq as any, submitRes as any);

  expect(submitRes.statusCode).toBe(200);

  const listReq: MockReq = authedReq("heir_1", "heir@example.com", {
    method: "GET",
    path: `/v1/cases/${caseId}/death-claims`
  });
  const listRes = createRes();
  await handler(listReq as any, listRes as any);

  expect(listRes.body?.data?.claim?.status).toBe("SUBMITTED");
  expect(listRes.body?.data?.files?.length ?? 0).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL with 404 or NOT_FOUND for death-claims

**Step 3: Write minimal implementation**

- `cases.ts` に追加:
  - `GET /v1/cases/:caseId/death-claims`（最新1件＋files＋確認数）
  - `POST /v1/cases/:caseId/death-claims`（SUBMITTED 作成）
- 最新は `createdAt` の降順で取得し、ファイルは `files` サブコレクションを返却。

```ts
app.get(":caseId/death-claims", async (c) => {
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

  const claimsSnap = await db
    .collection(`cases/${caseId}/deathClaims`)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  const claimDoc = claimsSnap.docs[0];
  if (!claimDoc) return jsonOk(c, { claim: null, files: [], confirmationsCount: 0, requiredCount: 0, confirmedByMe: false });

  const filesSnap = await claimDoc.ref.collection("files").get();
  const files = filesSnap.docs.map((doc) => ({ fileId: doc.id, ...doc.data() }));

  const confirmationsSnap = await claimDoc.ref.collection("confirmations").get();
  const confirmationsCount = confirmationsSnap.docs.length;
  const requiredCount = Math.max(1, Math.floor((memberUids.length - 1) / 2) + 1);
  const confirmedByMe = confirmationsSnap.docs.some((doc) => doc.id === auth.uid);

  return jsonOk(c, {
    claim: { claimId: claimDoc.id, ...claimDoc.data() },
    files,
    confirmationsCount,
    requiredCount,
    confirmedByMe
  });
});

app.post(":caseId/death-claims", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Case not found");
  const caseData = caseSnap.data() ?? {};
  const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
  if (caseData.ownerUid === auth.uid || !memberUids.includes(auth.uid)) {
    return jsonError(c, 403, "FORBIDDEN", "権限がありません");
  }

  const existingSnap = await db
    .collection(`cases/${caseId}/deathClaims`)
    .where("status", "in", ["SUBMITTED", "ADMIN_APPROVED"])
    .get();
  if (existingSnap.docs.length > 0) {
    return jsonError(c, 409, "CONFLICT", "既に申請済みです");
  }

  const now = c.get("deps").now();
  const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc();
  await claimRef.set({
    submittedByUid: auth.uid,
    status: "SUBMITTED",
    createdAt: now,
    updatedAt: now
  });
  return jsonOk(c, { claimId: claimRef.id });
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "死亡診断書の提出と一覧APIを追加"
```

---

### Task 2: Functions - uploadRequests / files 確定 API を追加

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`
- Modify: `storage.rules`

**Step 1: Write the failing test**

```ts
it("issues upload request and registers file", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  const caseId = "case_1";
  const db = getFirestore();
  await db.collection("cases").doc(caseId).set({
    caseId,
    ownerUid: "owner_1",
    memberUids: ["owner_1", "heir_1"],
    stage: "WAITING",
    assetLockStatus: "LOCKED",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc("claim_1");
  await claimRef.set({ submittedByUid: "heir_1", status: "SUBMITTED", createdAt: new Date(), updatedAt: new Date() });

  const issueReq: MockReq = authedReq("heir_1", "heir@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/death-claims/claim_1/upload-requests`,
    body: { fileName: "death.pdf", contentType: "application/pdf", size: 1024 }
  });
  const issueRes = createRes();
  await handler(issueReq as any, issueRes as any);

  expect(issueRes.body?.data?.requestId).toBeTruthy();

  const fileReq: MockReq = authedReq("heir_1", "heir@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/death-claims/claim_1/files`,
    body: { requestId: issueRes.body?.data?.requestId }
  });
  const fileRes = createRes();
  await handler(fileReq as any, fileRes as any);

  expect(fileRes.statusCode).toBe(200);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL with 404

**Step 3: Write minimal implementation**

- `upload-requests` を発行（contentType/size バリデーション、10MB、PDF/JPG/PNG）
- `files` 確定で `uploadRequests.status=VERIFIED` と `files` 追加

```ts
const isAllowedContentType = (value: string) =>
  ["application/pdf", "image/jpeg", "image/png"].includes(value);
const maxSize = 10 * 1024 * 1024;

app.post(":caseId/death-claims/:claimId/upload-requests", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const claimId = c.req.param("claimId");
  const body = await c.req.json().catch(() => ({}));
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const size = Number(body?.size ?? 0);
  if (!fileName || !isAllowedContentType(contentType) || !Number.isFinite(size) || size <= 0 || size > maxSize) {
    return jsonError(c, 400, "VALIDATION_ERROR", "ファイル形式またはサイズが不正です");
  }

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
  if (claimSnap.data()?.status !== "SUBMITTED") {
    return jsonError(c, 400, "VALIDATION_ERROR", "提出済みの申請のみ追加できます");
  }

  const now = c.get("deps").now();
  const requestRef = claimRef.collection("uploadRequests").doc();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  await requestRef.set({
    uid: auth.uid,
    fileName,
    contentType,
    size,
    status: "ISSUED",
    expiresAt,
    createdAt: now
  });

  return jsonOk(c, {
    requestId: requestRef.id,
    uploadPath: `cases/${caseId}/death-claims/${claimId}/${requestRef.id}`
  });
});

app.post(":caseId/death-claims/:claimId/files", async (c) => {
  const auth = c.get("auth");
  const caseId = c.req.param("caseId");
  const claimId = c.req.param("claimId");
  const body = await c.req.json().catch(() => ({}));
  const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) return jsonError(c, 400, "VALIDATION_ERROR", "requestIdは必須です");

  const db = getFirestore();
  const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
  const requestRef = claimRef.collection("uploadRequests").doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Upload request not found");
  const request = requestSnap.data() ?? {};
  if (request.uid !== auth.uid) return jsonError(c, 403, "FORBIDDEN", "権限がありません");

  const now = c.get("deps").now();
  const fileRef = claimRef.collection("files").doc();
  await fileRef.set({
    storagePath: `cases/${caseId}/death-claims/${claimId}/${requestId}`,
    fileName: request.fileName,
    contentType: request.contentType,
    size: request.size,
    uploadedByUid: auth.uid,
    createdAt: now
  });
  await requestRef.set({ status: "VERIFIED" }, { merge: true });

  return jsonOk(c, { fileId: fileRef.id });
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
 git commit -m "死亡診断書のアップロード許可APIを追加"
```

---

### Task 3: Functions - 管理者承認 API + Auth admin claim

**Files:**
- Modify: `apps/functions/src/api/types.ts`
- Modify: `apps/functions/src/api/deps.ts`
- Modify: `apps/functions/src/api/app.ts`
- Create: `apps/functions/src/api/routes/admin.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("allows admin to approve death claim", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  const caseId = "case_1";
  const db = getFirestore();
  await db.collection("cases").doc(caseId).set({
    caseId,
    ownerUid: "owner_1",
    memberUids: ["owner_1", "heir_1"],
    stage: "WAITING",
    assetLockStatus: "LOCKED",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").set({
    submittedByUid: "heir_1",
    status: "SUBMITTED",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const req: MockReq = authedReq("admin_1", "admin@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/death-claims/claim_1/admin-approve`
  });
  const res = createRes();
  await handler(req as any, res as any);

  expect(res.statusCode).toBe(200);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL with 404/403

**Step 3: Write minimal implementation**

- `AuthState` に `admin?: boolean` を追加
- `deps.ts` で `decoded.admin === true` をセット
- `adminRoutes` を追加し、`POST /v1/cases/:caseId/death-claims/:claimId/admin-approve` を実装
- `app.ts` に admin route を追加

```ts
// types.ts
export type AuthState = { uid: string; email?: string | null; admin?: boolean };

// deps.ts
const decoded = await getAuth().verifyIdToken(match[1]);
return { uid: decoded.uid, email: decoded.email ?? null, admin: decoded.admin === true };

// admin.ts
import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import type { ApiBindings } from "../types.js";
import { jsonError, jsonOk } from "../utils/response.js";

export const adminRoutes = () => {
  const app = new Hono<ApiBindings>();

  app.post("cases/:caseId/death-claims/:claimId/admin-approve", async (c) => {
    const auth = c.get("auth");
    if (!auth.admin) return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    const caseId = c.req.param("caseId");
    const claimId = c.req.param("claimId");
    const db = getFirestore();
    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) return jsonError(c, 404, "NOT_FOUND", "Claim not found");

    const now = c.get("deps").now();
    await claimRef.set({ status: "ADMIN_APPROVED", adminApprovedByUid: auth.uid, adminApprovedAt: now, updatedAt: now }, { merge: true });
    return jsonOk(c);
  });

  return app;
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/types.ts apps/functions/src/api/deps.ts apps/functions/src/api/app.ts apps/functions/src/api/routes/admin.ts apps/functions/src/api/handler.test.ts
git commit -m "管理者承認APIとadmin権限を追加"
```

---

### Task 4: Functions - 相続人同意（過半数）API

**Files:**
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write the failing test**

```ts
it("confirms death after admin approve and majority consent", async () => {
  const handler = createApiHandler({
    repo: new InMemoryAssetRepository(),
    caseRepo: new InMemoryCaseRepository(),
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    getAuthUser,
    getOwnerUidForRead: async (uid) => uid
  });

  const caseId = "case_1";
  const db = getFirestore();
  await db.collection("cases").doc(caseId).set({
    caseId,
    ownerUid: "owner_1",
    memberUids: ["owner_1", "heir_1", "heir_2", "heir_3"],
    stage: "WAITING",
    assetLockStatus: "LOCKED",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").set({
    submittedByUid: "heir_1",
    status: "ADMIN_APPROVED",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const confirm1: MockReq = authedReq("heir_1", "heir1@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/death-claims/claim_1/confirm`
  });
  const res1 = createRes();
  await handler(confirm1 as any, res1 as any);
  expect(res1.statusCode).toBe(200);

  const confirm2: MockReq = authedReq("heir_2", "heir2@example.com", {
    method: "POST",
    path: `/v1/cases/${caseId}/death-claims/claim_1/confirm`
  });
  const res2 = createRes();
  await handler(confirm2 as any, res2 as any);
  expect(res2.statusCode).toBe(200);

  const claimSnap = await db.collection(`cases/${caseId}/deathClaims`).doc("claim_1").get();
  expect(claimSnap.data()?.status).toBe("CONFIRMED");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL with 404

**Step 3: Write minimal implementation**

```ts
app.post(":caseId/death-claims/:claimId/confirm", async (c) => {
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
  if (claimSnap.data()?.status !== "ADMIN_APPROVED") {
    return jsonError(c, 400, "VALIDATION_ERROR", "運営承認が必要です");
  }

  const confirmationRef = claimRef.collection("confirmations").doc(auth.uid);
  const confirmationSnap = await confirmationRef.get();
  if (!confirmationSnap.exists) {
    await confirmationRef.set({ uid: auth.uid, createdAt: c.get("deps").now() });
  }

  const confirmationsSnap = await claimRef.collection("confirmations").get();
  const confirmationsCount = confirmationsSnap.docs.length;
  const heirCount = Math.max(0, memberUids.length - 1);
  const requiredCount = Math.max(1, Math.floor(heirCount / 2) + 1);

  if (confirmationsCount >= requiredCount) {
    const now = c.get("deps").now();
    await claimRef.set({ status: "CONFIRMED", confirmedAt: now, updatedAt: now }, { merge: true });
    await caseRef.set({ stage: "IN_PROGRESS", updatedAt: now }, { merge: true });
  }

  return jsonOk(c, { confirmationsCount, requiredCount });
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/cases.ts apps/functions/src/api/handler.test.ts
git commit -m "死亡診断書の同意APIを追加"
```

---

### Task 5: Storage Rules - death-claims アップロード制御

**Files:**
- Modify: `storage.rules`

**Step 1: Write a failing rule test**

(ルールテストが無い場合は TODO コメントを追加し、手動確認に切り替える)

**Step 2: Implement rules**

```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() { return request.auth.token.admin == true; }
    function caseDoc(caseId) {
      return get(/databases/$(database)/documents/cases/$(caseId));
    }
    function isCaseMember(caseId) {
      return caseDoc(caseId).data.memberUids.hasAny([request.auth.uid]);
    }
    function uploadRequest(caseId, claimId, requestId) {
      return get(/databases/$(database)/documents/cases/$(caseId)/deathClaims/$(claimId)/uploadRequests/$(requestId));
    }
    function isUploadAllowed(caseId, claimId, requestId) {
      let req = uploadRequest(caseId, claimId, requestId);
      return req.exists()
        && req.data.uid == request.auth.uid
        && req.data.status == "ISSUED"
        && req.data.contentType == request.resource.contentType
        && req.data.size == request.resource.size
        && request.time < req.data.expiresAt;
    }

    match /cases/{caseId}/death-claims/{claimId}/{requestId} {
      allow read: if isSignedIn() && (isCaseMember(caseId) || isAdmin());
      allow write: if isSignedIn() && (isCaseMember(caseId) || isAdmin()) && isUploadAllowed(caseId, claimId, requestId);
    }

    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Step 3: Run emulator smoke check**

Run: `task firebase:emulate`
Expected: emulator starts without rule parse errors

**Step 4: Commit**

```bash
git add storage.rules
git commit -m "死亡診断書アップロードの権限ルールを追加"
```

---

### Task 6: Web - death-claims API クライアント

**Files:**
- Create: `apps/web/src/app/api/death-claims.ts`
- Create: `apps/web/src/app/api/death-claims.test.ts`

**Step 1: Write the failing test**

```ts
import { vi, describe, it, expect } from "vitest";
const apiFetchMock = vi.fn(async () => ({ ok: true, data: {} }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("death claims api", () => {
  it("calls submit", async () => {
    const { submitDeathClaim } = await import("./death-claims");
    await submitDeathClaim("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/death-claims", { method: "POST" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- death-claims.test.ts`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

```ts
import { apiFetch } from "../../features/shared/lib/api";

export type DeathClaimFile = {
  fileId: string;
  fileName: string;
  contentType: string;
  size: number;
  storagePath: string;
};

export type DeathClaimData = {
  claimId: string;
  status: "SUBMITTED" | "ADMIN_APPROVED" | "CONFIRMED";
  submittedByUid: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DeathClaimSummary = {
  claim: DeathClaimData | null;
  files: DeathClaimFile[];
  confirmationsCount: number;
  requiredCount: number;
  confirmedByMe: boolean;
};

export const getDeathClaim = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims`, { method: "GET" });
  return result.data as DeathClaimSummary;
};

export const submitDeathClaim = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims`, { method: "POST" });
  return result.data as { claimId: string };
};

export const createDeathClaimUploadRequest = async (
  caseId: string,
  claimId: string,
  payload: { fileName: string; contentType: string; size: number }
) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/upload-requests`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data as { requestId: string; uploadPath: string };
};

export const finalizeDeathClaimFile = async (caseId: string, claimId: string, requestId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/files`, {
    method: "POST",
    body: JSON.stringify({ requestId })
  });
  return result.data as { fileId: string };
};

export const confirmDeathClaim = async (caseId: string, claimId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/confirm`, { method: "POST" });
  return result.data as { confirmationsCount: number; requiredCount: number };
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- death-claims.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/api/death-claims.ts apps/web/src/app/api/death-claims.test.ts
git commit -m "死亡診断書APIクライアントを追加"
```

---

### Task 7: Web - `/cases/:id/death-claims` UI 追加

**Files:**
- Create: `apps/web/src/app/pages/DeathClaimsPage.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/styles/deathClaimsPage.module.css`
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`

**Step 1: Write the failing test**

```ts
it("renders death claims page", async () => {
  const { renderToString } = await import("react-dom/server");
  const { MemoryRouter } = await import("react-router-dom");
  const { default: App } = await import("../App");

  const html = renderToString(
    <MemoryRouter initialEntries={["/cases/case-1/death-claims"]}>
      <App />
    </MemoryRouter>
  );
  expect(html).toContain("死亡診断書");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts`
Expected: FAIL (route not found)

**Step 3: Write minimal implementation**

- `DeathClaimsPage` に提出/一覧/同意ボタンを実装
- `App.tsx` にルート追加
- `CaseDetailPage` に相続人向けリンク（ボタン）を追加

```tsx
// App.tsx
<Route
  path="/cases/:caseId/death-claims"
  element={
    <RequireAuth>
      <DeathClaimsPage />
    </RequireAuth>
  }
/>
```

**Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/pages/DeathClaimsPage.tsx apps/web/src/app/App.tsx apps/web/src/styles/deathClaimsPage.module.css apps/web/src/app/pages/CaseDetailPage.tsx
git commit -m "死亡診断書ページを追加"
```

---

### Task 8: Admin App - 新規 `apps/admin` 作成

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/index.html`
- Create: `apps/admin/src/main.tsx`
- Create: `apps/admin/src/App.tsx`
- Create: `apps/admin/src/index.css`
- Create: `apps/admin/src/lib/firebase.ts`
- Create: `apps/admin/src/lib/api.ts`
- Create: `apps/admin/src/api/death-claims.ts`
- Create: `apps/admin/src/pages/LoginPage.tsx`
- Create: `apps/admin/src/pages/ClaimsPage.tsx`
- Create: `apps/admin/src/pages/ClaimDetailPage.tsx`

**Step 1: Scaffold app**

Run: `pnpm create vite apps/admin -- --template react-ts`
Expected: Vite scaffolded

**Step 2: Replace with minimal admin UI**

- Firebase Auth でログイン
- `admin` claim がなければ「権限がありません」表示
- `/` に SUBMITTED 一覧、`/claims/:caseId/:claimId` に詳細と承認ボタン

**Step 3: Add admin API client**

```ts
export const listPendingDeathClaims = async () => {
  const result = await apiFetch("/v1/admin/death-claims?status=SUBMITTED", { method: "GET" });
  return result.data as Array<{ caseId: string; claimId: string; submittedByUid: string; createdAt: string }>;
};

export const getDeathClaimDetail = async (caseId: string, claimId: string) => {
  const result = await apiFetch(`/v1/admin/death-claims/${caseId}/${claimId}`, { method: "GET" });
  return result.data as { claim: any; files: any[] };
};

export const approveDeathClaim = async (caseId: string, claimId: string) => {
  await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/admin-approve`, { method: "POST" });
};
```

**Step 4: Manual verify**

Run: `pnpm -C apps/admin dev`
Expected: ログイン→未承認一覧→詳細→承認が実行できる

**Step 5: Commit**

```bash
git add apps/admin
git commit -m "管理者アプリを追加"
```

---

### Task 9: Admin API - 一覧/詳細取得

**Files:**
- Modify: `apps/functions/src/api/routes/admin.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write failing tests**

```ts
it("lists submitted death claims for admin", async () => {
  // collectionGroup("deathClaims") の SUBMITTED を返す
});
```

**Step 2: Run test**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL

**Step 3: Implement**

- `GET /v1/admin/death-claims?status=SUBMITTED`
- `GET /v1/admin/death-claims/:caseId/:claimId`

**Step 4: Run test**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 5: Run functions build**

Run: `task functions:build`
Expected: tsc completes

**Step 6: Commit**

```bash
git add apps/functions/src/api/routes/admin.ts apps/functions/src/api/handler.test.ts
git commit -m "管理者向け死亡診断書一覧APIを追加"
```

---

### Task 10: Docs & Final check

**Files:**
- Modify: `docs/plans/2026-01-31-death-claim-flow-design.md` (必要なら)

**Step 1: Run app checks**

Run: `pnpm -C apps/web test -- CaseDetailPage.test.ts`
Expected: PASS

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 2: Build**

Run: `task functions:build`
Expected: tsc completes

**Step 3: Commit (optional)**

```bash
git add docs/plans/2026-01-31-death-claim-flow-design.md
git commit -m "死亡診断書フロー設計を更新"
```
