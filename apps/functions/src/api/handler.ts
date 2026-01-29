import {
  FirestoreAssetRepository,
  ListAssetsByOwner,
  RegisterAsset,
  AssetId,
  AssetIdentifier,
  OwnerId,
  OccurredAt,
  AssetRepository
} from "@kototsute/asset";
import {
  DomainError,
  assetCreateSchema,
  inviteCreateSchema,
  planCreateSchema,
  planAllocationSchema
} from "@kototsute/shared";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import crypto from "node:crypto";
import type { Hono } from "hono";

export const requestHandler = (app: Hono) => {
  return async (req: any, res: any) => {
    const method = String(req.method ?? "GET").toUpperCase();
    const protocol = req.protocol ?? "https";
    const hostname = req.hostname ?? req.headers?.host ?? "localhost";
    const url = new URL(`${protocol}://${hostname}${req.url ?? ""}`);
    const headers = new Headers();
    Object.entries(req.headers ?? {}).forEach(([key, value]) => {
      if (typeof value === "string") {
        headers.set(key, value);
        return;
      }
      if (Array.isArray(value)) {
        headers.set(key, value.join(","));
      }
    });

    let body: BodyInit | undefined;
    if (!["GET", "HEAD"].includes(method)) {
      const rawBody = req.body;
      if (rawBody === undefined || rawBody === null) {
        body = undefined;
      } else if (
        typeof rawBody === "string" ||
        rawBody instanceof Uint8Array ||
        rawBody instanceof ArrayBuffer
      ) {
        body = rawBody as BodyInit;
      } else {
        body = JSON.stringify(rawBody);
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
      }
    }

    const honoRes = await app.fetch(
      new Request(url.toString(), {
        method,
        headers,
        body
      })
    );

    if (typeof res.setHeader === "function") {
      honoRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
    }

    res.status(honoRes.status);
    const contentType = honoRes.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      res.json(await honoRes.json());
      return;
    }
    res.send(await honoRes.text());
  };
};

type XrplToken = {
  currency: string;
  issuer: string | null;
  isNative: boolean;
};

type XrplStatus =
  | { status: "ok"; balanceXrp: string; ledgerIndex?: number; tokens?: XrplToken[] }
  | { status: "error"; message: string };

type PlanHistoryEntryInput = {
  type: string;
  title: string;
  detail?: string | null;
  actorUid?: string | null;
  actorEmail?: string | null;
  createdAt?: Date;
  meta?: Record<string, unknown> | null;
};

export type ApiDeps = {
  repo: AssetRepository;
  now: () => Date;
  getUid: (req: any) => Promise<string>;
  getAuthUser: (req: any) => Promise<{ uid: string; email?: string | null }>;
  getOwnerUidForRead: (uid: string) => Promise<string>;
};

const XRPL_URL = process.env.XRPL_URL ?? "https://s.altnet.rippletest.net:51234";
const XRPL_VERIFY_ADDRESS =
  process.env.XRPL_VERIFY_ADDRESS ?? "rp7W5EetJmFuACL7tT1RJNoLE4S92Pg1JS";

const json = (res: any, status: number, body: any) => {
  res.status(status).json(body);
};

const unauthorizedError = () => new Error("UNAUTHORIZED");

const formatXrp = (drops: string): string => {
  const value = Number(drops) / 1_000_000;
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\\.0+$/, "").replace(/\\.(\\d*?)0+$/, ".$1");
};

const fetchXrplAccountInfo = async (address: string): Promise<XrplStatus> => {
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

const fetchXrplAccountLines = async (
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

const formatDate = (value: any): string => {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const formatPlanToken = (token: any): string | null => {
  if (!token || typeof token !== "object") return null;
  const currency = typeof token.currency === "string" ? token.currency : "";
  if (!currency) return null;
  const isNative = Boolean(token.isNative);
  if (isNative) return currency;
  const issuer = typeof token.issuer === "string" ? token.issuer : "";
  return issuer ? `${currency} (${issuer})` : currency;
};

const normalizePlanAllocations = (
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
    return [
      ...cleaned,
      { heirUid: null, value: Number((100 - sum).toFixed(6)), isUnallocated: true }
    ];
  }
  return cleaned;
};

const appendPlanHistory = async (planRef: any, input: PlanHistoryEntryInput) => {
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

const createChallenge = () => {
  return crypto.randomBytes(8).toString("hex");
};

const decodeHex = (value?: string) => {
  if (!value) return "";
  try {
    return Buffer.from(value, "hex").toString("utf8");
  } catch {
    return "";
  }
};

const fetchXrplTx = async (txHash: string) => {
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

export const createApiHandler = (deps: ApiDeps) => {
  return async (req: any, res: any) => {
    try {
      const method = req.method ?? "";
      const path = String(req.path ?? req.url ?? "").split("?")[0];
      const segments = path.split("/").filter(Boolean);

      if (path === "/v1/assets" && method === "POST") {
        const uid = await deps.getUid(req);
        const { label, address } = req.body ?? {};
        const parsed = assetCreateSchema.safeParse({
          label: typeof label === "string" ? label.trim() : label,
          address
        });
        if (!parsed.success) {
          return json(res, 400, {
            ok: false,
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "入力が不正です"
          });
        }

        const usecase = new RegisterAsset(deps.repo);
        const now = OccurredAt.create(deps.now());
        const asset = await usecase.execute({
          ownerId: OwnerId.create(uid),
          type: "CRYPTO_WALLET",
          identifier: AssetIdentifier.create(parsed.data.address),
          label: parsed.data.label,
          linkLevel: "L0",
          status: "MANUAL",
          dataSource: "SELF_DECLARED",
          now
        });

        return json(res, 200, {
          ok: true,
          data: {
            assetId: asset.getAssetId().toString(),
            label: asset.getLabel(),
            address: asset.getIdentifier().toString()
          }
        });
      }

      if (path === "/v1/assets" && method === "GET") {
        const uid = await deps.getUid(req);
        const ownerUid = await deps.getOwnerUidForRead(uid);
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

        return json(res, 200, {
          ok: true,
          data: assets.map((asset) => ({
            assetId: asset.getAssetId().toString(),
            label: asset.getLabel(),
            address: asset.getIdentifier().toString(),
            createdAt: asset.getCreatedAt().toDate().toISOString(),
            verificationStatus: statusMap.get(asset.getAssetId().toString()) ?? "UNVERIFIED"
          }))
        });
      }

      if (path === "/v1/invites" && method === "POST") {
        const authUser = await deps.getAuthUser(req);
        const { email, relationLabel, relationOther, memo } = req.body ?? {};
        const parsed = inviteCreateSchema.safeParse({
          email,
          relationLabel,
          relationOther,
          memo
        });
        if (!parsed.success) {
          return json(res, 400, {
            ok: false,
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "入力が不正です"
          });
        }

        const normalizedEmail = normalizeEmail(parsed.data.email);
        const now = deps.now();
        const db = getFirestore();
        const resolveInviteReceiver = async (): Promise<string | null> => {
          try {
            const user = await getAuth().getUserByEmail(normalizedEmail);
            return user.uid;
          } catch (error: any) {
            if (error?.code === "auth/user-not-found") {
              return null;
            }
            throw error;
          }
        };
        const existingSnapshot = await db
          .collection("invites")
          .where("ownerUid", "==", authUser.uid)
          .where("email", "==", normalizedEmail)
          .get();
        const existingDoc = existingSnapshot.docs[0];
        if (existingDoc) {
          const existing = existingDoc.data();
          if (existing?.status === "declined") {
            await existingDoc.ref.set(
              {
                status: "pending",
                relationLabel: parsed.data.relationLabel,
                relationOther: parsed.data.relationOther?.trim() ?? null,
                memo: parsed.data.memo?.trim() ?? null,
                updatedAt: now,
                declinedAt: null
              },
              { merge: true }
            );
            const receiverUid = await resolveInviteReceiver();
            if (receiverUid) {
              const notificationRef = db.collection("notifications").doc();
              await notificationRef.set({
                receiverUid,
                type: "INVITE_SENT",
                title: "相続人招待が届きました",
                body: "相続人招待を受け取りました。",
                related: { kind: "invite", id: existingDoc.id },
                isRead: false,
                createdAt: now
              });
            }
            return json(res, 200, {
              ok: true,
              data: {
                inviteId: existingDoc.id,
                status: "pending"
              }
            });
          }
          return json(res, 409, {
            ok: false,
            code: "CONFLICT",
            message: "このメールアドレスは既に招待済みです"
          });
        }

        const receiverUid = await resolveInviteReceiver();
        const isExistingUserAtInvite = Boolean(receiverUid);

        const inviteRef = db.collection("invites").doc();
        await inviteRef.set({
          ownerUid: authUser.uid,
          email: normalizedEmail,
          status: "pending",
          relationLabel: parsed.data.relationLabel,
          relationOther: parsed.data.relationOther?.trim() ?? null,
          memo: parsed.data.memo?.trim() ?? null,
          isExistingUserAtInvite,
          acceptedByUid: null,
          acceptedAt: null,
          declinedAt: null,
          createdAt: now,
          updatedAt: now
        });

        if (receiverUid) {
          const notificationRef = db.collection("notifications").doc();
          await notificationRef.set({
            receiverUid,
            type: "INVITE_SENT",
            title: "相続人招待が届きました",
            body: "相続人招待を受け取りました。",
            related: { kind: "invite", id: inviteRef.id },
            isRead: false,
            createdAt: now
          });
        }

        return json(res, 200, {
          ok: true,
          data: {
            inviteId: inviteRef.id
          }
        });
      }

      if (path === "/v1/invites" && method === "GET") {
        const scope = String(req.query?.scope ?? "");
        if (scope !== "owner" && scope !== "received") {
          return json(res, 400, {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "scopeの指定が不正です"
          });
        }

        const authUser = await deps.getAuthUser(req);
        if (scope === "received" && !authUser.email) {
          return json(res, 400, {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "メールアドレスが取得できません"
          });
        }

        const db = getFirestore();
        const query =
          scope === "owner"
            ? db.collection("invites").where("ownerUid", "==", authUser.uid)
            : db.collection("invites").where("email", "==", normalizeEmail(authUser.email ?? ""));

        const snapshot = await query.get();
        const ownerUids = Array.from(
          new Set(snapshot.docs.map((doc) => doc.data()?.ownerUid).filter(Boolean))
        ) as string[];
        const ownerEmailMap = new Map<string, string | null>();
        if (scope === "received" && ownerUids.length > 0) {
          await Promise.all(
            ownerUids.map(async (ownerUid) => {
              try {
                const user = await getAuth().getUser(ownerUid);
                ownerEmailMap.set(ownerUid, user.email ?? null);
              } catch (error: any) {
                if (error?.code === "auth/user-not-found") {
                  ownerEmailMap.set(ownerUid, null);
                  return;
                }
                throw error;
              }
            })
          );
        }
        return json(res, 200, {
          ok: true,
          data: snapshot.docs.map((doc) => {
            const data = doc.data();
            const acceptedAt = data.acceptedAt ? formatDate(data.acceptedAt) : null;
            const declinedAt = data.declinedAt ? formatDate(data.declinedAt) : null;
            return {
              inviteId: doc.id,
              ownerUid: data.ownerUid ?? "",
              ownerEmail: ownerEmailMap.get(data.ownerUid) ?? null,
              email: data.email ?? "",
              status: data.status ?? "pending",
              relationLabel: data.relationLabel ?? "",
              relationOther: data.relationOther ?? null,
              memo: data.memo ?? null,
              isExistingUserAtInvite: data.isExistingUserAtInvite ?? false,
              acceptedByUid: data.acceptedByUid ?? null,
              createdAt: formatDate(data.createdAt),
              updatedAt: formatDate(data.updatedAt),
              acceptedAt,
              declinedAt
            };
          })
        });
      }

      if (path === "/v1/plans" && method === "POST") {
        const authUser = await deps.getAuthUser(req);
        const { title } = req.body ?? {};
        const parsed = planCreateSchema.safeParse({
          title: typeof title === "string" ? title.trim() : title
        });
        if (!parsed.success) {
          return json(res, 400, {
            ok: false,
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "入力が不正です"
          });
        }

        const now = deps.now();
        const db = getFirestore();
        const doc = db.collection("plans").doc();
        const data = {
          planId: doc.id,
          ownerUid: authUser.uid,
          ownerEmail: authUser.email ?? null,
          title: parsed.data.title,
          status: "DRAFT",
          sharedAt: null,
          heirUids: [],
          heirs: [],
          createdAt: now,
          updatedAt: now
        };
        await doc.set(data);
        await appendPlanHistory(doc, {
          type: "PLAN_CREATED",
          title: "指図を作成しました",
          detail: data.title ? `タイトル: ${data.title}` : null,
          actorUid: authUser.uid,
          actorEmail: authUser.email ?? null,
          createdAt: now,
          meta: {
            title: data.title,
            status: data.status
          }
        });

        return json(res, 200, {
          ok: true,
          data: {
            planId: doc.id,
            title: data.title,
            status: data.status
          }
        });
      }

      if (path === "/v1/plans" && method === "GET") {
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const snapshot = await db.collection("plans").where("ownerUid", "==", authUser.uid).get();
        const data = snapshot.docs.map((doc) => {
          const plan = doc.data() ?? {};
          return {
            planId: plan.planId ?? doc.id,
            title: plan.title ?? "",
            status: plan.status ?? "DRAFT",
            sharedAt: formatDate(plan.sharedAt),
            updatedAt: formatDate(plan.updatedAt)
          };
        });

        return json(res, 200, { ok: true, data });
      }

      if (
        segments[0] === "v1" &&
        segments[1] === "plans" &&
        segments[2] &&
        segments[3] === "history" &&
        method === "GET"
      ) {
        const planId = segments[2];
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const planRef = db.collection("plans").doc(planId);
        const planSnap = await planRef.get();
        if (!planSnap.exists) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Plan not found" });
        }
        const plan = planSnap.data() ?? {};
        if (plan.ownerUid !== authUser.uid) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }

        const snapshot = await planRef.collection("history").orderBy("createdAt", "desc").get();
        const data = snapshot.docs.map((doc) => {
          const history = doc.data() ?? {};
          return {
            historyId: history.historyId ?? doc.id,
            type: history.type ?? "",
            title: history.title ?? "",
            detail: history.detail ?? null,
            actorUid: history.actorUid ?? null,
            actorEmail: history.actorEmail ?? null,
            createdAt: formatDate(history.createdAt),
            meta: history.meta ?? null
          };
        });
        return json(res, 200, { ok: true, data });
      }

      if (
        segments[0] === "v1" &&
        segments[1] === "plans" &&
        segments[2] &&
        segments[3] === "assets" &&
        method === "GET"
      ) {
        const planId = segments[2];
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const planRef = db.collection("plans").doc(planId);
        const planSnap = await planRef.get();
        if (!planSnap.exists) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Plan not found" });
        }
        const plan = planSnap.data() ?? {};
        if (plan.ownerUid !== authUser.uid) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }

        const snapshot = await planRef.collection("assets").orderBy("createdAt", "desc").get();
        const data = snapshot.docs.map((doc) => {
          const planAsset = doc.data() ?? {};
          return {
            planAssetId: planAsset.planAssetId ?? doc.id,
            assetId: planAsset.assetId ?? "",
            assetType: planAsset.assetType ?? "",
            assetLabel: planAsset.assetLabel ?? "",
            token: planAsset.token ?? null,
            unitType: planAsset.unitType ?? "PERCENT",
            allocations: Array.isArray(planAsset.allocations) ? planAsset.allocations : []
          };
        });
        return json(res, 200, { ok: true, data });
      }

      if (
        segments[0] === "v1" &&
        segments[1] === "plans" &&
        segments[2] &&
        !segments[3] &&
        method === "GET"
      ) {
        const planId = segments[2];
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const planRef = db.collection("plans").doc(planId);
        const planSnap = await planRef.get();
        if (!planSnap.exists) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Plan not found" });
        }
        const plan = planSnap.data() ?? {};
        if (plan.ownerUid !== authUser.uid) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }

        return json(res, 200, {
          ok: true,
          data: {
            planId,
            title: plan.title ?? "",
            status: plan.status ?? "DRAFT",
            sharedAt: formatDate(plan.sharedAt),
            updatedAt: formatDate(plan.updatedAt),
            heirUids: plan.heirUids ?? [],
            heirs: plan.heirs ?? []
          }
        });
      }

      if (path === "/v1/notifications" && method === "GET") {
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const snapshot = await db
          .collection("notifications")
          .where("receiverUid", "==", authUser.uid)
          .get();
        const data = snapshot.docs.map((doc) => {
          const notification = doc.data() ?? {};
          return {
            notificationId: doc.id,
            receiverUid: notification.receiverUid ?? "",
            type: notification.type ?? "",
            title: notification.title ?? "",
            body: notification.body ?? "",
            related: notification.related ?? null,
            isRead: Boolean(notification.isRead),
            createdAt: formatDate(notification.createdAt)
          };
        });
        return json(res, 200, { ok: true, data });
      }

      if (
        segments[0] === "v1" &&
        segments[1] === "notifications" &&
        segments[2] === "read-all" &&
        method === "POST"
      ) {
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const snapshot = await db
          .collection("notifications")
          .where("receiverUid", "==", authUser.uid)
          .get();
        await Promise.all(
          snapshot.docs.map((doc) =>
            doc.ref.set(
              {
                isRead: true,
                readAt: deps.now()
              },
              { merge: true }
            )
          )
        );
        return json(res, 200, { ok: true });
      }

      if (
        segments[0] === "v1" &&
        segments[1] === "notifications" &&
        segments[2] &&
        segments[3] === "read" &&
        method === "POST"
      ) {
        const notificationId = segments[2];
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const notificationRef = db.collection("notifications").doc(notificationId);
        const notificationSnap = await notificationRef.get();
        if (!notificationSnap.exists) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Notification not found" });
        }
        const notification = notificationSnap.data() ?? {};
        if (notification.receiverUid !== authUser.uid) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }
        await notificationRef.set(
          {
            isRead: true,
            readAt: deps.now()
          },
          { merge: true }
        );
        return json(res, 200, { ok: true });
      }

      if (segments[0] === "v1" && segments[1] === "plans" && segments[2] && method === "POST") {
        const planId = segments[2];
        const action = segments[3];
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const planRef = db.collection("plans").doc(planId);
        const planSnap = await planRef.get();
        if (!planSnap.exists) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Plan not found" });
        }
        const plan = planSnap.data() ?? {};
        if (plan.ownerUid !== authUser.uid) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }
        const currentStatus = plan.status ?? "DRAFT";

        if (action === "status") {
          const nextStatus = req.body?.status;
          if (nextStatus !== "DRAFT" && nextStatus !== "SHARED" && nextStatus !== "INACTIVE") {
            return json(res, 400, {
              ok: false,
              code: "VALIDATION_ERROR",
              message: "statusが不正です"
            });
          }
          const now = deps.now();
          const updates: Record<string, unknown> = {
            status: nextStatus,
            updatedAt: now
          };
          if (nextStatus === "SHARED") {
            updates.sharedAt = now;
          }
          if (nextStatus === "DRAFT") {
            updates.sharedAt = null;
          }
          await planRef.set(updates, { merge: true });

          if (nextStatus === "SHARED" && currentStatus !== "SHARED") {
            const heirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
            await Promise.all(
              heirUids.map(async (heirUid: string) => {
                const notificationRef = db.collection("notifications").doc();
                await notificationRef.set({
                  receiverUid: heirUid,
                  type: "PLAN_SHARED",
                  title: "指図が共有されました",
                  body: plan.title ? `「${plan.title}」が共有されました。` : "指図が共有されました。",
                  related: { kind: "plan", id: planId },
                  isRead: false,
                  createdAt: now
                });
              })
            );
          }

          const historyType =
            nextStatus === "SHARED"
              ? "PLAN_SHARED"
              : nextStatus === "INACTIVE"
                ? "PLAN_INACTIVATED"
                : "PLAN_STATUS_CHANGED";
          const historyTitle =
            nextStatus === "SHARED"
              ? "指図を共有しました"
              : nextStatus === "INACTIVE"
                ? "指図を無効にしました"
                : "指図のステータスを変更しました";
          await appendPlanHistory(planRef, {
            type: historyType,
            title: historyTitle,
            detail: plan.title ? `タイトル: ${plan.title}` : null,
            actorUid: authUser.uid,
            actorEmail: authUser.email ?? null,
            createdAt: now,
            meta: {
              prevStatus: currentStatus,
              nextStatus
            }
          });

          return json(res, 200, { ok: true });
        }

        if (action === "heirs") {
          if (currentStatus === "INACTIVE") {
            return json(res, 400, {
              ok: false,
              code: "INACTIVE",
              message: "無効の指図は編集できません"
            });
          }
          const { heirUid } = req.body ?? {};
          if (typeof heirUid !== "string" || heirUid.trim().length === 0) {
            return json(res, 400, {
              ok: false,
              code: "VALIDATION_ERROR",
              message: "heirUidは必須です"
            });
          }

          const inviteSnap = await db
            .collection("invites")
            .where("ownerUid", "==", authUser.uid)
            .where("status", "==", "accepted")
            .where("acceptedByUid", "==", heirUid)
            .get();
          if (inviteSnap.docs.length === 0) {
            return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Invite not found" });
          }

          const invite = inviteSnap.docs[0]?.data() ?? {};
          const now = deps.now();
          const currentHeirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
          const isNewHeir = !currentHeirUids.includes(heirUid);
          const nextHeirUids = currentHeirUids.includes(heirUid)
            ? currentHeirUids
            : [...currentHeirUids, heirUid];
          const currentHeirs = Array.isArray(plan.heirs) ? plan.heirs : [];
          const nextHeirs = currentHeirs.some((heir: any) => heir.uid === heirUid)
            ? currentHeirs
            : [
                ...currentHeirs,
                {
                  uid: heirUid,
                  email: invite.email ?? "",
                  relationLabel: invite.relationLabel ?? "",
                  relationOther: invite.relationOther ?? null
                }
              ];

          await planRef.set(
            {
              heirUids: nextHeirUids,
              heirs: nextHeirs,
              updatedAt: now
            },
            { merge: true }
          );
          if (isNewHeir) {
            const relationLabel = invite.relationLabel || "相続人";
            const detailParts = [relationLabel, invite.email].filter(Boolean);
            await appendPlanHistory(planRef, {
              type: "PLAN_HEIR_ADDED",
              title: "相続人を追加しました",
              detail: detailParts.join(" / "),
              actorUid: authUser.uid,
              actorEmail: authUser.email ?? null,
              createdAt: now,
              meta: {
                heirUid,
                relationLabel: invite.relationLabel ?? "",
                relationOther: invite.relationOther ?? null,
                email: invite.email ?? ""
              }
            });
          }

          return json(res, 200, { ok: true });
        }

        if (action === "assets" && !segments[4]) {
          if (currentStatus === "INACTIVE") {
            return json(res, 400, {
              ok: false,
              code: "INACTIVE",
              message: "無効の指図は編集できません"
            });
          }
          const { assetId, unitType, token } = req.body ?? {};
          if (typeof assetId !== "string" || assetId.trim().length === 0) {
            return json(res, 400, {
              ok: false,
              code: "VALIDATION_ERROR",
              message: "assetIdは必須です"
            });
          }
          if (unitType !== "PERCENT" && unitType !== "AMOUNT") {
            return json(res, 400, {
              ok: false,
              code: "VALIDATION_ERROR",
              message: "unitTypeが不正です"
            });
          }

          const asset = await deps.repo.findById(AssetId.create(assetId));
          if (!asset) {
            return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Asset not found" });
          }
          if (asset.getOwnerId().toString() !== authUser.uid) {
            return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
          }

          const planAssetRef = planRef.collection("assets").doc();
          await planAssetRef.set({
            planAssetId: planAssetRef.id,
            assetId,
            assetType: asset.getType(),
            assetLabel: asset.getLabel(),
            token: token ?? null,
            unitType,
            allocations: [],
            createdAt: deps.now(),
            updatedAt: deps.now()
          });
          const tokenLabel = formatPlanToken(token);
          const assetDetail = tokenLabel ? `${asset.getLabel()} / ${tokenLabel}` : asset.getLabel();
          await appendPlanHistory(planRef, {
            type: "PLAN_ASSET_ADDED",
            title: "資産を追加しました",
            detail: assetDetail,
            actorUid: authUser.uid,
            actorEmail: authUser.email ?? null,
            createdAt: deps.now(),
            meta: {
              planAssetId: planAssetRef.id,
              assetId,
              assetLabel: asset.getLabel(),
              unitType,
              token: token ?? null
            }
          });

          return json(res, 200, { ok: true, data: { planAssetId: planAssetRef.id } });
        }

        if (action === "assets" && segments[4] && segments[5] === "allocations") {
          if (currentStatus === "INACTIVE") {
            return json(res, 400, {
              ok: false,
              code: "INACTIVE",
              message: "無効の指図は編集できません"
            });
          }
          const planAssetId = segments[4];
          const parsed = planAllocationSchema.safeParse(req.body ?? {});
          if (!parsed.success) {
            return json(res, 400, {
              ok: false,
              code: "VALIDATION_ERROR",
              message: parsed.error.issues[0]?.message ?? "入力が不正です"
            });
          }

          const { unitType, allocations } = parsed.data;
          const cleaned = allocations.map((allocation) => ({
            heirUid: allocation.heirUid,
            value: allocation.value,
            isUnallocated: allocation.isUnallocated ?? false
          }));

          let nextAllocations = cleaned;
          if (unitType === "PERCENT") {
            const sum = cleaned.reduce((total, allocation) => total + allocation.value, 0);
            if (sum < 100) {
              nextAllocations = [
                ...cleaned,
                { heirUid: null, value: Number((100 - sum).toFixed(6)), isUnallocated: true }
              ];
            }
          }

          const planAssetRef = planRef.collection("assets").doc(planAssetId);
          await planAssetRef.set(
            {
              unitType,
              allocations: nextAllocations,
              updatedAt: deps.now()
            },
            { merge: true }
          );
          const planAssetSnap = await planAssetRef.get();
          const planAsset = planAssetSnap.data() ?? {};
          const assetLabel = typeof planAsset.assetLabel === "string" ? planAsset.assetLabel : "資産";
          const tokenLabel = formatPlanToken(planAsset.token);
          const detail = tokenLabel ? `${assetLabel} / ${tokenLabel}` : assetLabel;
          const assignedTotal = cleaned.reduce((total, allocation) => total + allocation.value, 0);
          const unallocatedEntry = nextAllocations.find((allocation) => allocation.isUnallocated);
          const unallocatedValue = unallocatedEntry?.value ?? null;
          await appendPlanHistory(planRef, {
            type: "PLAN_ALLOCATION_UPDATED",
            title: "配分を更新しました",
            detail,
            actorUid: authUser.uid,
            actorEmail: authUser.email ?? null,
            createdAt: deps.now(),
            meta: {
              planAssetId,
              unitType,
              allocationCount: cleaned.length,
              assignedTotal,
              unallocated: unallocatedValue,
              total:
                unitType === "PERCENT"
                  ? Number((assignedTotal + (unallocatedValue ?? 0)).toFixed(6))
                  : assignedTotal
            }
          });
          return json(res, 200, { ok: true });
        }

        if (action === "share") {
          const now = deps.now();
          await planRef.set(
            {
              status: "SHARED",
              sharedAt: now,
              updatedAt: now
            },
            { merge: true }
          );
          await appendPlanHistory(planRef, {
            type: "PLAN_SHARED",
            title: "指図を共有しました",
            detail: plan.title ? `タイトル: ${plan.title}` : null,
            actorUid: authUser.uid,
            actorEmail: authUser.email ?? null,
            createdAt: now,
            meta: {
              prevStatus: plan.status ?? "DRAFT",
              nextStatus: "SHARED"
            }
          });
          const heirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
          await Promise.all(
            heirUids.map(async (heirUid: string) => {
              const notificationRef = db.collection("notifications").doc();
              await notificationRef.set({
                receiverUid: heirUid,
                type: "PLAN_SHARED",
                title: "指図が共有されました",
                body: plan.title ? `「${plan.title}」が共有されました。` : "指図が共有されました。",
                related: { kind: "plan", id: planId },
                isRead: false,
                createdAt: now
              });
            })
          );
          return json(res, 200, { ok: true });
        }

        if (action === "inactivate") {
          const now = deps.now();
          await planRef.set(
            {
              status: "INACTIVE",
              updatedAt: now
            },
            { merge: true }
          );
          await appendPlanHistory(planRef, {
            type: "PLAN_INACTIVATED",
            title: "指図を無効にしました",
            detail: plan.title ? `タイトル: ${plan.title}` : null,
            actorUid: authUser.uid,
            actorEmail: authUser.email ?? null,
            createdAt: now,
            meta: {
              prevStatus: plan.status ?? "DRAFT",
              nextStatus: "INACTIVE"
            }
          });
          return json(res, 200, { ok: true });
        }
      }

      if (segments[0] === "v1" && segments[1] === "plans" && segments[2] && method === "DELETE") {
        const planId = segments[2];
        const action = segments[3];
        const targetId = segments[4];
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const planRef = db.collection("plans").doc(planId);
        const planSnap = await planRef.get();
        if (!planSnap.exists) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Plan not found" });
        }
        const plan = planSnap.data() ?? {};
        if (plan.ownerUid !== authUser.uid) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }
        const currentStatus = plan.status ?? "DRAFT";

        if (action === "assets" && targetId) {
          if (currentStatus === "INACTIVE") {
            return json(res, 400, {
              ok: false,
              code: "INACTIVE",
              message: "無効の指図は編集できません"
            });
          }
          const planAssetRef = planRef.collection("assets").doc(targetId);
          const planAssetSnap = await planAssetRef.get();
          if (!planAssetSnap.exists) {
            return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Plan asset not found" });
          }
          const planAsset = planAssetSnap.data() ?? {};
          await planAssetRef.delete();
          const tokenLabel = formatPlanToken(planAsset.token);
          const assetLabel = typeof planAsset.assetLabel === "string" ? planAsset.assetLabel : "資産";
          const detail = tokenLabel ? `${assetLabel} / ${tokenLabel}` : assetLabel;
          await appendPlanHistory(planRef, {
            type: "PLAN_ASSET_REMOVED",
            title: "資産を削除しました",
            detail,
            actorUid: authUser.uid,
            actorEmail: authUser.email ?? null,
            createdAt: deps.now(),
            meta: {
              planAssetId: targetId,
              assetId: planAsset.assetId ?? null,
              assetLabel,
              unitType: planAsset.unitType ?? null,
              token: planAsset.token ?? null
            }
          });
          return json(res, 200, { ok: true });
        }

        if (action === "heirs" && targetId) {
          if (currentStatus === "INACTIVE") {
            return json(res, 400, {
              ok: false,
              code: "INACTIVE",
              message: "無効の指図は編集できません"
            });
          }
          const currentHeirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
          const currentHeirs = Array.isArray(plan.heirs) ? plan.heirs : [];
          const removedHeir = currentHeirs.find((heir: any) => heir.uid === targetId);
          if (!currentHeirUids.includes(targetId)) {
            return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Heir not found" });
          }

          const now = deps.now();
          await planRef.set(
            {
              heirUids: currentHeirUids.filter((uid: string) => uid !== targetId),
              heirs: currentHeirs.filter((heir: any) => heir.uid !== targetId),
              updatedAt: now
            },
            { merge: true }
          );

          const assetsSnap = await planRef.collection("assets").get();
          await Promise.all(
            assetsSnap.docs.map(async (assetDoc) => {
              const planAsset = assetDoc.data() ?? {};
              const unitType = planAsset.unitType === "AMOUNT" ? "AMOUNT" : "PERCENT";
              const allocations = Array.isArray(planAsset.allocations) ? planAsset.allocations : [];
              const filtered = allocations.filter((allocation: any) => allocation.heirUid !== targetId);
              const nextAllocations = normalizePlanAllocations(
                unitType,
                filtered.map((allocation: any) => ({
                  heirUid: allocation.heirUid ?? null,
                  value: Number(allocation.value ?? 0),
                  isUnallocated: Boolean(allocation.isUnallocated)
                }))
              );
              await assetDoc.ref.set(
                {
                  allocations: nextAllocations,
                  updatedAt: now
                },
                { merge: true }
              );
            })
          );

          const relationLabel =
            typeof removedHeir?.relationLabel === "string" ? removedHeir.relationLabel : "相続人";
          const relationOther = removedHeir?.relationOther ?? null;
          const detailParts = [relationLabel, removedHeir?.email].filter(Boolean);
          await appendPlanHistory(planRef, {
            type: "PLAN_HEIR_REMOVED",
            title: "相続人を削除しました",
            detail: detailParts.join(" / "),
            actorUid: authUser.uid,
            actorEmail: authUser.email ?? null,
            createdAt: now,
            meta: {
              heirUid: targetId,
              relationLabel,
              relationOther,
              email: removedHeir?.email ?? ""
            }
          });

          return json(res, 200, { ok: true });
        }
      }

      if (segments[0] === "v1" && segments[1] === "assets" && segments[2]) {
        const assetId = segments[2];
        const uid = await deps.getUid(req);
        const ownerUid = await deps.getOwnerUidForRead(uid);

        const asset = await deps.repo.findById(AssetId.create(assetId));
        if (!asset) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Asset not found" });
        }
        if (asset.getOwnerId().toString() !== ownerUid) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }

        if (method === "DELETE") {
          await deps.repo.deleteById(AssetId.create(assetId));
          return json(res, 200, { ok: true });
        }

        if (method === "GET") {
          const includeXrpl =
            String(req.query?.includeXrpl ?? req.query?.sync ?? "false") === "true" ||
            String(req.query?.includeXrpl ?? req.query?.sync ?? "0") === "1";

          let xrpl: XrplStatus | undefined;
          if (includeXrpl && asset.getType() === "CRYPTO_WALLET") {
            const address = asset.getIdentifier().toString();
            xrpl = await fetchXrplAccountInfo(address);
            if (xrpl.status === "ok") {
              const lines = await fetchXrplAccountLines(address);
              if (lines.status === "ok") {
                xrpl = { ...xrpl, tokens: lines.tokens };
              } else {
                xrpl = { status: "error", message: lines.message };
              }
            }
            const db = getFirestore();
            const logRef = db
              .collection("assets")
              .doc(assetId)
              .collection("syncLogs")
              .doc();
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
              createdAt: formatDate(data.createdAt)
            };
          });

          const assetDoc = await db.collection("assets").doc(assetId).get();
          const assetData = assetDoc.data() ?? {};

          return json(res, 200, {
            ok: true,
            data: {
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
            }
          });
        }

        if (method === "POST" && segments[3] === "verify" && segments[4] === "challenge") {
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
          return json(res, 200, {
            ok: true,
            data: {
              challenge,
              address: XRPL_VERIFY_ADDRESS,
              amountDrops: "1"
            }
          });
        }

        if (method === "POST" && segments[3] === "verify" && segments[4] === "confirm") {
          const { txHash } = req.body ?? {};
          if (typeof txHash !== "string" || txHash.trim().length === 0) {
            return json(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "txHashは必須です" });
          }
          const db = getFirestore();
          const assetDoc = await db.collection("assets").doc(assetId).get();
          const assetData = assetDoc.data() ?? {};
          const challenge = assetData.verificationChallenge as string | undefined;
          if (!challenge) {
            return json(res, 400, { ok: false, code: "VERIFY_CHALLENGE_MISSING", message: "検証コードがありません" });
          }

          const result = await fetchXrplTx(txHash);
          if (!result.ok) {
            return json(res, 400, { ok: false, code: "XRPL_TX_NOT_FOUND", message: result.message });
          }

          const tx = result.tx;
          const from = tx?.Account;
          const to = tx?.Destination;
          const amount = tx?.Amount;
          const memos = Array.isArray(tx?.Memos) ? tx.Memos : [];
          const memoTexts = memos
            .map((memo: any) => decodeHex(memo?.Memo?.MemoData))
            .filter((value: string) => value.length > 0);
          const memoMatch = memoTexts.includes(challenge);

          if (from !== asset.getIdentifier().toString()) {
            return json(res, 400, {
              ok: false,
              code: "VERIFY_FROM_MISMATCH",
              message: "送信元アドレスが一致しません"
            });
          }
          if (to !== XRPL_VERIFY_ADDRESS) {
            return json(res, 400, {
              ok: false,
              code: "VERIFY_DESTINATION_MISMATCH",
              message: "送金先アドレスが一致しません"
            });
          }
          if (String(amount) !== "1") {
            return json(res, 400, {
              ok: false,
              code: "VERIFY_AMOUNT_MISMATCH",
              message: "送金額が一致しません（1 drop）"
            });
          }
          if (!memoMatch) {
            return json(res, 400, {
              ok: false,
              code: "VERIFY_MEMO_MISMATCH",
              message: "Memoに検証コードが含まれていません"
            });
          }

          await db.collection("assets").doc(assetId).set(
            {
              verificationStatus: "VERIFIED",
              verificationVerifiedAt: deps.now()
            },
            { merge: true }
          );

          return json(res, 200, { ok: true });
        }
      }

      if (segments[0] === "v1" && segments[1] === "invites" && segments[2] && method === "POST") {
        const inviteId = segments[2];
        const action = segments[3];
        if (action !== "accept" && action !== "decline") {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Not found" });
        }

        const authUser = await deps.getAuthUser(req);
        if (!authUser.email) {
          return json(res, 400, {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "メールアドレスが取得できません"
          });
        }

        const db = getFirestore();
        const inviteRef = db.collection("invites").doc(inviteId);
        const inviteSnap = await inviteRef.get();
        if (!inviteSnap.exists) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Invite not found" });
        }
        const invite = inviteSnap.data() ?? {};
        const authEmail = normalizeEmail(authUser.email);
        if (invite.email !== authEmail) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }

        const now = deps.now();
        if (action === "accept") {
          await inviteRef.set(
            {
              status: "accepted",
              acceptedByUid: authUser.uid,
              acceptedAt: now,
              updatedAt: now
            },
            { merge: true }
          );

          const heirRef = db.collection("heirs").doc(authUser.uid);
          const heirSnap = await heirRef.get();
          const createdAt = heirSnap.exists ? heirSnap.data()?.createdAt ?? now : now;
          await heirRef.set(
            {
              uid: authUser.uid,
              ownerUid: invite.ownerUid,
              email: invite.email,
              relationLabel: invite.relationLabel ?? "",
              relationOther: invite.relationOther ?? null,
              memo: invite.memo ?? null,
              createdAt,
              updatedAt: now
            },
            { merge: true }
          );

          const notificationRef = db.collection("notifications").doc();
          await notificationRef.set({
            receiverUid: invite.ownerUid,
            type: "INVITE_ACCEPTED",
            title: "招待が受諾されました",
            body: "招待が受諾されました。",
            related: { kind: "invite", id: inviteId },
            isRead: false,
            createdAt: now
          });

          return json(res, 200, { ok: true });
        }

        await inviteRef.set(
          {
            status: "declined",
            acceptedByUid: null,
            acceptedAt: null,
            declinedAt: now,
            updatedAt: now
          },
          { merge: true }
        );
        const notificationRef = db.collection("notifications").doc();
        await notificationRef.set({
          receiverUid: invite.ownerUid,
          type: "INVITE_DECLINED",
          title: "招待が辞退されました",
          body: "招待が辞退されました。",
          related: { kind: "invite", id: inviteId },
          isRead: false,
          createdAt: now
        });
        return json(res, 200, { ok: true });
      }

      if (segments[0] === "v1" && segments[1] === "invites" && segments[2] && method === "DELETE") {
        if (segments[3]) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Not found" });
        }

        const inviteId = segments[2];
        const authUser = await deps.getAuthUser(req);
        const db = getFirestore();
        const inviteRef = db.collection("invites").doc(inviteId);
        const inviteSnap = await inviteRef.get();
        if (!inviteSnap.exists) {
          return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Invite not found" });
        }
        const invite = inviteSnap.data() ?? {};
        if (invite.ownerUid !== authUser.uid) {
          return json(res, 403, { ok: false, code: "FORBIDDEN", message: "権限がありません" });
        }
        if (invite.status === "accepted") {
          return json(res, 400, {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "受諾済みの招待は削除できません"
          });
        }

        await inviteRef.delete();
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Not found" });
    } catch (error: any) {
      console.error("[api] error", error);
      if (error?.message === "UNAUTHORIZED") {
        return json(res, 401, { ok: false, code: "UNAUTHORIZED", message: "認証が必要です" });
      }
      if (error instanceof DomainError) {
        return json(res, 400, { ok: false, code: error.code, message: error.message });
      }
      return json(res, 500, { ok: false, code: "INTERNAL_ERROR", message: "Internal server error" });
    }
  };
};

export const createDefaultDeps = (): ApiDeps => {
  const repo = new FirestoreAssetRepository();
  const getAuthUserFromReq = async (req: any) => {
    const authHeader = req.get?.("Authorization") ?? "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      throw unauthorizedError();
    }
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
    getUid: async (req: any) => {
      const authUser = await getAuthUserFromReq(req);
      return authUser.uid;
    },
    getAuthUser: getAuthUserFromReq,
    getOwnerUidForRead: async (uid: string) => uid
  };
};
