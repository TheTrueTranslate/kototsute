# Functions Hono移行 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** apps/functions を Hono ベースへ移行し、既存APIの互換性を保ったままルーティング分割と型整備を行う。

**Architecture:** Hono アプリを `api/app.ts` に集約し、Functions 側は Express 互換ハンドラーで Hono を呼び出す。ルートは `routes/*` に分割し、共通 middleware（CORS/認証/エラー/404）を app 初期化で設定する。

**Tech Stack:** Firebase Functions v2, Hono, TypeScript, Vitest, Firebase Admin

---

### Task 1: Honoリクエストハンドラーの最小テストを追加

**Files:**
- Create: `apps/functions/src/api/handler.hono.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requestHandler } from "./handler";

type MockReq = {
  method: string;
  url: string;
  protocol: string;
  hostname: string;
  headers: Record<string, string>;
  body?: unknown;
};

type MockRes = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockRes;
  json: (body: unknown) => MockRes;
  send: (body: unknown) => MockRes;
};

const createRes = (): MockRes => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  }
});

describe("requestHandler", () => {
  it("forwards status and json body", async () => {
    const app = new Hono().basePath("/v1");
    app.get("/ping", (c) => c.json({ ok: true }, 201));

    const handler = requestHandler(app);
    const req: MockReq = {
      method: "GET",
      url: "/v1/ping",
      protocol: "https",
      hostname: "example.test",
      headers: {}
    };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- handler.hono.test.ts`
Expected: FAIL（`requestHandler` が未実装/未エクスポート）

**Step 3: Commit (tests only)**

```bash
git add apps/functions/src/api/handler.hono.test.ts
git commit -m "Honoハンドラーのテストを追加"
```

---

### Task 2: Hono + Functions ブリッジハンドラーを実装

**Files:**
- Modify: `apps/functions/src/api/handler.ts`

**Step 1: Write minimal implementation**

```ts
import type { Response } from "express";
import type { Request as FunctionRequest } from "firebase-functions/v2/https";
import type { Hono } from "hono";

export const requestHandler = (app: Hono) => {
  return async (req: FunctionRequest, res: Response) => {
    const url = new URL(`${req.protocol}://${req.hostname}${req.url}`);
    const headers = new Headers();
    Object.keys(req.headers).forEach((k) => {
      const value = req.headers[k];
      if (typeof value === "string") headers.set(k, value);
    });

    const method = req.method ?? "GET";
    const body = req.body;
    const request = ["GET", "HEAD"].includes(method)
      ? new Request(url, { method, headers })
      : new Request(url, {
          method,
          headers,
          body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body ?? {}))
        });

    const honoRes = await app.fetch(request);

    res.status(honoRes.status);
    const contentType = honoRes.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      res.json(await honoRes.json());
      return;
    }
    res.send(await honoRes.text());
  };
};
```

**Step 2: Run test to verify it passes**

Run: `pnpm -C apps/functions test -- handler.hono.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/functions/src/api/handler.ts
git commit -m "Honoハンドラーを実装"
```

---

### Task 3: Honoアプリ初期化・共通型・ミドルウェアの導入

**Files:**
- Modify: `apps/functions/package.json`
- Create: `apps/functions/src/api/types.ts`
- Create: `apps/functions/src/api/app.ts`
- Create: `apps/functions/src/api/middlewares/auth.ts`
- Create: `apps/functions/src/api/utils/response.ts`
- Create: `apps/functions/src/api/deps.ts`

**Step 1: Write failing test (compile error) for createApp**

```ts
// apps/functions/src/api/app.test.ts
import { describe, it, expect } from "vitest";
import { createApp } from "./app";

const deps = {
  repo: { findById: async () => null } as any,
  now: () => new Date("2024-01-01T00:00:00.000Z"),
  getAuthUser: async () => ({ uid: "u1", email: "u1@example.com" }),
  getOwnerUidForRead: async (uid: string) => uid
};

describe("createApp", () => {
  it("returns 404 json for unknown route", async () => {
    const app = createApp(deps as any);
    const res = await app.request("/v1/unknown");
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body).toEqual({ ok: false, code: "NOT_FOUND", message: "Not found" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C apps/functions test -- app.test.ts`
Expected: FAIL（`createApp` 未実装）

**Step 3: Add dependency**

```json
// apps/functions/package.json
"dependencies": {
  "hono": "^4.6.0",
  ...
}
```

**Step 4: Implement types/deps/helpers**

```ts
// apps/functions/src/api/types.ts
export type AuthState = { uid: string; email?: string | null };
export type ErrorResponse = { ok: false; code: string; message: string };
export type OkResponse<T> = { ok: true; data: T } | { ok: true };
export type ApiResponse<T> = OkResponse<T> | ErrorResponse;

export type ApiDeps = {
  repo: import("@kototsute/asset").AssetRepository;
  now: () => Date;
  getAuthUser: (authHeader: string | null | undefined) => Promise<AuthState>;
  getOwnerUidForRead: (uid: string) => Promise<string>;
};

export type ApiBindings = {
  Variables: {
    auth: AuthState;
    deps: ApiDeps;
  };
};
```

```ts
// apps/functions/src/api/deps.ts
import { FirestoreAssetRepository } from "@kototsute/asset";
import { getAuth } from "firebase-admin/auth";
import type { ApiDeps } from "./types";

const unauthorizedError = () => new Error("UNAUTHORIZED");

export const createDefaultDeps = (): ApiDeps => {
  const repo = new FirestoreAssetRepository();
  const getAuthUser = async (authHeader: string | null | undefined) => {
    const match = String(authHeader ?? "").match(/^Bearer (.+)$/);
    if (!match) throw unauthorizedError();
    try {
      const decoded = await getAuth().verifyIdToken(match[1]);
      return { uid: decoded.uid, email: decoded.email ?? null };
    } catch (error: any) {
      if (typeof error?.code === "string" && error.code.startsWith("auth/")) {
        throw unauthorizedError();
      }
      throw error;
    }
  };

  return {
    repo,
    now: () => new Date(),
    getAuthUser,
    getOwnerUidForRead: async (uid: string) => uid
  };
};

export { unauthorizedError };
```

```ts
// apps/functions/src/api/utils/response.ts
import type { Context } from "hono";
import type { ApiBindings } from "../types";

export const jsonOk = <T>(c: Context<ApiBindings>, data?: T, status = 200) => {
  if (data === undefined) return c.json({ ok: true }, status);
  return c.json({ ok: true, data }, status);
};

export const jsonError = (c: Context<ApiBindings>, status: number, code: string, message: string) => {
  return c.json({ ok: false, code, message }, status);
};
```

```ts
// apps/functions/src/api/middlewares/auth.ts
import type { MiddlewareHandler } from "hono";
import type { ApiBindings } from "../types";

export const createAuthMiddleware = (): MiddlewareHandler<ApiBindings> => {
  return async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const deps = c.get("deps");
    const authHeader = c.req.header("Authorization");
    const auth = await deps.getAuthUser(authHeader);
    c.set("auth", auth);
    await next();
  };
};
```

```ts
// apps/functions/src/api/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "firebase-functions";
import type { ApiBindings, ApiDeps } from "./types";
import { createAuthMiddleware } from "./middlewares/auth";
import { jsonError } from "./utils/response";
import { assetsRoutes } from "./routes/assets";
import { invitesRoutes } from "./routes/invites";
import { plansRoutes } from "./routes/plans";
import { notificationsRoutes } from "./routes/notifications";
import { createDefaultDeps } from "./deps";
import { DomainError } from "@kototsute/shared";

export const createApp = (deps: ApiDeps) => {
  const app = new Hono<ApiBindings>().basePath("/v1");

  app.use("*", (c, next) => {
    c.set("deps", deps);
    return next();
  });

  app.use(
    "*",
    cors({
      origin: true,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"]
    })
  );

  app.use("*", createAuthMiddleware());

  app.route("/assets", assetsRoutes());
  app.route("/invites", invitesRoutes());
  app.route("/plans", plansRoutes());
  app.route("/notifications", notificationsRoutes());

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err?.message === "UNAUTHORIZED") {
      return jsonError(c, 401, "UNAUTHORIZED", "認証が必要です");
    }
    if (err instanceof DomainError) {
      return jsonError(c, 400, err.code, err.message);
    }
    logger.error(err);
    return jsonError(c, 500, "INTERNAL_ERROR", "Internal server error");
  });

  app.notFound((c) => jsonError(c, 404, "NOT_FOUND", "Not found"));

  return app;
};

export const app = createApp(createDefaultDeps());
```

**Step 5: Run tests**

Run: `pnpm -C apps/functions test -- app.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/functions/package.json apps/functions/src/api/types.ts apps/functions/src/api/deps.ts apps/functions/src/api/middlewares/auth.ts apps/functions/src/api/utils/response.ts apps/functions/src/api/app.ts apps/functions/src/api/app.test.ts
git commit -m "Honoアプリ基盤を追加"
```

---

### Task 4: ルーティング分割（assets/invites/plans/notifications）

**Files:**
- Create: `apps/functions/src/api/utils/date.ts`
- Create: `apps/functions/src/api/utils/email.ts`
- Create: `apps/functions/src/api/utils/plan.ts`
- Create: `apps/functions/src/api/utils/xrpl.ts`
- Create: `apps/functions/src/api/routes/assets.ts`
- Create: `apps/functions/src/api/routes/invites.ts`
- Create: `apps/functions/src/api/routes/plans.ts`
- Create: `apps/functions/src/api/routes/notifications.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Write failing test (adjust deps signature)**

```ts
// apps/functions/src/api/handler.test.ts (deps部分だけ先に変更)
const handler = createApiHandler({
  repo,
  now: () => new Date("2024-01-01T00:00:00.000Z"),
  getAuthUser: async () => ({ uid: "owner_1", email: "owner@example.com" }),
  getOwnerUidForRead: async (uid) => uid
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: FAIL（`createApiHandler` が未対応）

**Step 3: Implement shared utils**

```ts
// apps/functions/src/api/utils/date.ts
export const formatDate = (value: any): string => {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
};
```

```ts
// apps/functions/src/api/utils/email.ts
export const normalizeEmail = (value: string): string => value.trim().toLowerCase();
```

```ts
// apps/functions/src/api/utils/plan.ts
import type { PlanHistoryEntryInput } from "../routes/types";

export const formatPlanToken = (token: any): string | null => {
  if (!token || typeof token !== "object") return null;
  const currency = typeof token.currency === "string" ? token.currency : "";
  if (!currency) return null;
  const isNative = Boolean(token.isNative);
  if (isNative) return currency;
  const issuer = typeof token.issuer === "string" ? token.issuer : "";
  return issuer ? `${currency} (${issuer})` : currency;
};

export const normalizePlanAllocations = (
  unitType: "PERCENT" | "AMOUNT",
  allocations: Array<{ heirUid: string | null; value: number; isUnallocated?: boolean }>
) => {
  const cleaned = allocations
    .filter((allocation) => !allocation.isUnallocated)
    .map((allocation) => ({
      heirUid: allocation.heirUid,
      value: allocation.value,
      isUnallocated: false
    }));
  if (unitType !== "PERCENT") return cleaned;
  const sum = cleaned.reduce((total, allocation) => total + allocation.value, 0);
  if (sum < 100) {
    return [...cleaned, { heirUid: null, value: Number((100 - sum).toFixed(6)), isUnallocated: true }];
  }
  return cleaned;
};

export const appendPlanHistory = async (planRef: any, input: PlanHistoryEntryInput) => {
  const historyRef = planRef.collection("history").doc();
  await historyRef.set({
    historyId: historyRef.id,
    type: input.type,
    title: input.title,
    detail: input.detail ?? null,
    actorUid: input.actorUid ?? null,
    actorEmail: input.actorEmail ?? null,
    createdAt: input.createdAt ?? new Date(),
    meta: input.meta ?? null
  });
};
```

```ts
// apps/functions/src/api/utils/xrpl.ts
import crypto from "node:crypto";

export type XrplToken = { currency: string; issuer: string | null; isNative: boolean };
export type XrplStatus =
  | { status: "ok"; balanceXrp: string; ledgerIndex?: number; tokens?: XrplToken[] }
  | { status: "error"; message: string };

export const XRPL_URL = process.env.XRPL_URL ?? "https://s.altnet.rippletest.net:51234";
export const XRPL_VERIFY_ADDRESS =
  process.env.XRPL_VERIFY_ADDRESS ?? "rp7W5EetJmFuACL7tT1RJNoLE4S92Pg1JS";

const formatXrp = (drops: string): string => {
  const value = Number(drops) / 1_000_000;
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\.0+$/, "").replace(/\.(\d*?)0+$/, ".$1");
};

export const fetchXrplAccountInfo = async (address: string): Promise<XrplStatus> => {
  try {
    const res = await fetch(XRPL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "account_info",
        params: [{ account: address, strict: true, ledger_index: "validated" }]
      })
    });

    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return { status: "error", message: payload?.error_message ?? "XRPL request failed" };
    }
    if (payload?.result?.error) {
      return {
        status: "error",
        message: payload?.result?.error_message ?? payload?.result?.error ?? "XRPL error"
      };
    }
    const balanceDrops = payload?.result?.account_data?.Balance;
    const ledgerIndex = payload?.result?.ledger_index;
    if (typeof balanceDrops !== "string") {
      return { status: "error", message: "XRPL balance is unavailable" };
    }
    return { status: "ok", balanceXrp: formatXrp(balanceDrops), ledgerIndex };
  } catch (error: any) {
    return { status: "error", message: error?.message ?? "XRPL request failed" };
  }
};

export const fetchXrplAccountLines = async (
  address: string
): Promise<{ status: "ok"; tokens: XrplToken[] } | { status: "error"; message: string }> => {
  try {
    const res = await fetch(XRPL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "account_lines",
        params: [{ account: address, ledger_index: "validated" }]
      })
    });

    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || payload?.result?.error) {
      return {
        status: "error",
        message: payload?.result?.error_message ?? payload?.error_message ?? "XRPL error"
      };
    }

    const lines = Array.isArray(payload?.result?.lines) ? payload.result.lines : [];
    const tokens = lines.map((line: any) => ({
      currency: String(line.currency ?? ""),
      issuer: typeof line.account === "string" ? line.account : null,
      isNative: false
    }));
    return { status: "ok", tokens };
  } catch (error: any) {
    return { status: "error", message: error?.message ?? "XRPL request failed" };
  }
};

export const createChallenge = () => crypto.randomBytes(8).toString("hex");

export const decodeHex = (value?: string) => {
  if (!value) return "";
  try {
    return Buffer.from(value, "hex").toString("utf8");
  } catch {
    return "";
  }
};

export const fetchXrplTx = async (txHash: string) => {
  const res = await fetch(XRPL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "tx",
      params: [{ transaction: txHash, binary: false }]
    })
  });
  const payload = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || payload?.result?.error) {
    return {
      ok: false,
      message: payload?.result?.error_message ?? payload?.error_message ?? "XRPL tx not found"
    };
  }
  return { ok: true, tx: payload?.result };
};
```

**Step 4: Implement routes**

```ts
// apps/functions/src/api/routes/assets.ts
import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import {
  AssetId,
  AssetIdentifier,
  OwnerId,
  OccurredAt,
  RegisterAsset,
  ListAssetsByOwner
} from "@kototsute/asset";
import { assetCreateSchema } from "@kototsute/shared";
import type { ApiBindings } from "../types";
import { jsonOk, jsonError } from "../utils/response";
import {
  XRPL_VERIFY_ADDRESS,
  fetchXrplAccountInfo,
  fetchXrplAccountLines,
  createChallenge,
  fetchXrplTx,
  decodeHex
} from "../utils/xrpl";

export const assetsRoutes = () => {
  const app = new Hono<ApiBindings>();

  app.post("/", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const parsed = assetCreateSchema.safeParse({
      label: typeof body?.label === "string" ? body.label.trim() : body?.label,
      address: body?.address
    });
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const usecase = new RegisterAsset(deps.repo);
    const now = OccurredAt.create(deps.now());
    const asset = await usecase.execute({
      ownerId: OwnerId.create(auth.uid),
      type: "CRYPTO_WALLET",
      identifier: AssetIdentifier.create(parsed.data.address),
      label: parsed.data.label,
      linkLevel: "L0",
      status: "MANUAL",
      dataSource: "SELF_DECLARED",
      now
    });

    return jsonOk(c, {
      assetId: asset.getAssetId().toString(),
      label: asset.getLabel(),
      address: asset.getIdentifier().toString()
    });
  });

  app.get("/", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const ownerUid = await deps.getOwnerUidForRead(auth.uid);
    const usecase = new ListAssetsByOwner(deps.repo);
    const assets = await usecase.execute(OwnerId.create(ownerUid));
    const db = getFirestore();
    const snapshot = await db.collection("assets").where("ownerId", "==", ownerUid).get();
    const statusMap = new Map(
      snapshot.docs.map((doc) => {
        const data = doc.data();
        return [doc.id, data.verificationStatus ?? "UNVERIFIED"];
      })
    );

    return jsonOk(
      c,
      assets.map((asset) => ({
        assetId: asset.getAssetId().toString(),
        label: asset.getLabel(),
        address: asset.getIdentifier().toString(),
        createdAt: asset.getCreatedAt().toDate().toISOString(),
        verificationStatus: statusMap.get(asset.getAssetId().toString()) ?? "UNVERIFIED"
      }))
    );
  });

  app.get(":assetId", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const assetId = c.req.param("assetId");
    const ownerUid = await deps.getOwnerUidForRead(auth.uid);
    const asset = await deps.repo.findById(AssetId.create(assetId));
    if (!asset) return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    if (asset.getOwnerId().toString() !== ownerUid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const includeXrpl =
      String(c.req.query("includeXrpl") ?? c.req.query("sync") ?? "false") === "true" ||
      String(c.req.query("includeXrpl") ?? c.req.query("sync") ?? "0") === "1";

    let xrpl: any;
    if (includeXrpl && asset.getType() === "CRYPTO_WALLET") {
      const address = asset.getIdentifier().toString();
      xrpl = await fetchXrplAccountInfo(address);
      if (xrpl.status === "ok") {
        const lines = await fetchXrplAccountLines(address);
        xrpl = lines.status === "ok" ? { ...xrpl, tokens: lines.tokens } : { status: "error", message: lines.message };
      }
      const db = getFirestore();
      const logRef = db.collection("assets").doc(assetId).collection("syncLogs").doc();
      await logRef.set({
        status: xrpl.status,
        balanceXrp: xrpl.status === "ok" ? xrpl.balanceXrp : null,
        ledgerIndex: xrpl.status === "ok" ? xrpl.ledgerIndex ?? null : null,
        message: xrpl.status === "error" ? xrpl.message : null,
        createdAt: deps.now()
      });
    }

    const db = getFirestore();
    const logsSnapshot = await db
      .collection("assets")
      .doc(assetId)
      .collection("syncLogs")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    const syncLogs = logsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        status: data.status,
        balanceXrp: data.balanceXrp ?? null,
        ledgerIndex: data.ledgerIndex ?? null,
        message: data.message ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date(data.createdAt).toISOString()
      };
    });
    const assetDoc = await db.collection("assets").doc(assetId).get();
    const assetData = assetDoc.data() ?? {};

    return jsonOk(c, {
      assetId: asset.getAssetId().toString(),
      label: asset.getLabel(),
      address: asset.getIdentifier().toString(),
      type: asset.getType(),
      status: asset.getStatus(),
      dataSource: asset.getDataSource(),
      linkLevel: asset.getLinkLevel(),
      createdAt: asset.getCreatedAt().toDate().toISOString(),
      verificationStatus: assetData.verificationStatus ?? "UNVERIFIED",
      verificationChallenge: assetData.verificationChallenge ?? null,
      verificationAddress: XRPL_VERIFY_ADDRESS,
      xrpl: xrpl ?? null,
      syncLogs
    });
  });

  app.delete(":assetId", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const assetId = c.req.param("assetId");
    const ownerUid = await deps.getOwnerUidForRead(auth.uid);
    const asset = await deps.repo.findById(AssetId.create(assetId));
    if (!asset) return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    if (asset.getOwnerId().toString() !== ownerUid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    await deps.repo.deleteById(AssetId.create(assetId));
    return jsonOk(c);
  });

  app.post(":assetId/verify/challenge", async (c) => {
    const deps = c.get("deps");
    const assetId = c.req.param("assetId");
    const challenge = createChallenge();
    const db = getFirestore();
    await db.collection("assets").doc(assetId).set(
      {
        verificationStatus: "PENDING",
        verificationChallenge: challenge,
        verificationIssuedAt: deps.now()
      },
      { merge: true }
    );
    return jsonOk(c, { challenge, address: XRPL_VERIFY_ADDRESS, amountDrops: "1" });
  });

  app.post(":assetId/verify/confirm", async (c) => {
    const deps = c.get("deps");
    const assetId = c.req.param("assetId");
    const body = await c.req.json().catch(() => ({}));
    const txHash = body?.txHash;
    if (typeof txHash !== "string" || txHash.trim().length === 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "txHashは必須です");
    }

    const db = getFirestore();
    const assetDoc = await db.collection("assets").doc(assetId).get();
    const assetData = assetDoc.data() ?? {};
    const challenge = assetData.verificationChallenge as string | undefined;
    if (!challenge) {
      return jsonError(c, 400, "VERIFY_CHALLENGE_MISSING", "検証コードがありません");
    }

    const asset = await deps.repo.findById(AssetId.create(assetId));
    if (!asset) return jsonError(c, 404, "NOT_FOUND", "Asset not found");

    const result = await fetchXrplTx(txHash);
    if (!result.ok) {
      return jsonError(c, 400, "XRPL_TX_NOT_FOUND", result.message);
    }

    const tx = result.tx as any;
    const from = tx?.Account;
    const to = tx?.Destination;
    const amount = tx?.Amount;
    const memos = Array.isArray(tx?.Memos) ? tx.Memos : [];
    const memoTexts = memos
      .map((memo: any) => decodeHex(memo?.Memo?.MemoData))
      .filter((value: string) => value.length > 0);
    const memoMatch = memoTexts.includes(challenge);

    if (from !== asset.getIdentifier().toString()) {
      return jsonError(c, 400, "VERIFY_FROM_MISMATCH", "送信元アドレスが一致しません");
    }
    if (to !== XRPL_VERIFY_ADDRESS) {
      return jsonError(c, 400, "VERIFY_DESTINATION_MISMATCH", "送金先アドレスが一致しません");
    }
    if (String(amount) !== "1") {
      return jsonError(c, 400, "VERIFY_AMOUNT_MISMATCH", "送金額が一致しません（1 drop）");
    }
    if (!memoMatch) {
      return jsonError(c, 400, "VERIFY_MEMO_MISMATCH", "Memoに検証コードが含まれていません");
    }

    await db.collection("assets").doc(assetId).set(
      { verificationStatus: "VERIFIED", verificationVerifiedAt: deps.now() },
      { merge: true }
    );

    return jsonOk(c);
  });

  return app;
};
```

（invites/plans/notifications も同様に現行ハンドラのロジックを移植）

**Step 5: Update handler to use Hono app**

```ts
// apps/functions/src/api/handler.ts
import type { Response } from "express";
import type { Request as FunctionRequest } from "firebase-functions/v2/https";
import type { Hono } from "hono";
import { createApp } from "./app";
import type { ApiDeps } from "./types";

export const requestHandler = (app: Hono) => {
  ... // Task2 と同じ
};

export const createApiHandler = (deps: ApiDeps) => requestHandler(createApp(deps));
```

**Step 6: Run tests**

Run: `pnpm -C apps/functions test -- handler.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/functions/src/api/routes apps/functions/src/api/utils apps/functions/src/api/handler.ts apps/functions/src/api/handler.test.ts
git commit -m "Honoルーティングを分割"
```

---

### Task 5: Functions エントリ更新

**Files:**
- Modify: `apps/functions/src/index.ts`

**Step 1: Update entry**

```ts
import "dotenv/config";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import { createApiHandler } from "./api/handler";
import { createDefaultDeps } from "./api/deps";

if (getApps().length === 0) {
  initializeApp();
}

const handler = createApiHandler(createDefaultDeps());

export const api = onRequest(async (req, res) => {
  logger.info("api called", { method: req.method, path: req.path });
  return handler(req, res);
});
```

**Step 2: Run tests**

Run: `pnpm -C apps/functions test`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/functions/src/index.ts
git commit -m "FunctionsエントリをHonoに切替"
```

---

### Task 6: 仕上げ（不要コード削除）

**Files:**
- Modify: `apps/functions/src/api/handler.ts`
- Modify: `apps/functions/src/api/handler.test.ts`

**Step 1: Remove old helper remnants**
- 旧 `createApiHandler` 内の分岐/ヘルパーを削除（すでに routes に移行済みなら不要）

**Step 2: Run tests**

Run: `pnpm -C apps/functions test`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/functions/src/api/handler.ts apps/functions/src/api/handler.test.ts
git commit -m "旧API実装を整理"
```

---

## Notes
- 既存API互換性を優先するため、レスポンス形状/ステータス/エラーコードは旧実装に合わせる
- 認証は全ルートに適用（OPTIONSは例外）
- `docs/plans` は gitignore 対象なので plan 追加時は `git add -f` を使用
