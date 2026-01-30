import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  assetCreateSchema,
  assetReserveSchema,
  displayNameSchema,
  inviteCreateSchema,
  planAllocationSchema,
  planCreateSchema
} from "@kototsute/shared";
import type { ApiBindings } from "../types.js";
import { jsonError, jsonOk } from "../utils/response.js";
import { normalizeEmail } from "../utils/email.js";
import { formatDate } from "../utils/date.js";
import { appendPlanHistory, normalizePlanAllocations } from "../utils/plan.js";
import { appendAssetHistory } from "../utils/asset-history.js";
import {
  XRPL_VERIFY_ADDRESS,
  createChallenge,
  decodeHex,
  fetchXrplAccountInfo,
  fetchXrplAccountLines,
  fetchXrplTx
} from "../utils/xrpl.js";

export const casesRoutes = () => {
  const app = new Hono<ApiBindings>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const parsed = displayNameSchema.safeParse(body?.ownerDisplayName);
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const { caseRepo } = c.get("deps");
    const existing = await caseRepo.getCaseByOwnerUid(auth.uid);
    if (existing) {
      return jsonError(c, 409, "CONFLICT", "ケースは既に作成されています");
    }

    const created = await caseRepo.createCase({
      ownerUid: auth.uid,
      ownerDisplayName: parsed.data
    });

    return jsonOk(c, created);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { caseRepo } = c.get("deps");
    const cases = await caseRepo.listCasesByMemberUid(auth.uid);
    const created = cases.filter((item) => item.ownerUid === auth.uid);
    const received = cases.filter((item) => item.ownerUid !== auth.uid);
    return jsonOk(c, { created, received });
  });

  app.get("invites", async (c) => {
    const auth = c.get("auth");
    const scope = String(c.req.query("scope") ?? "");
    if (scope !== "received") {
      return jsonError(c, 400, "VALIDATION_ERROR", "scopeの指定が不正です");
    }
    if (!auth.email) {
      return jsonError(c, 400, "VALIDATION_ERROR", "メールアドレスが登録されていません");
    }

    const db = getFirestore();
    const normalizedEmail = normalizeEmail(auth.email ?? "");
    const snapshot = await db.collectionGroup("invites").where("email", "==", normalizedEmail).get();
    const rawInvites: Array<Record<string, any>> = snapshot.docs.map((doc) => ({
      inviteId: doc.id,
      ...(doc.data() as Record<string, any>)
    }));
    const caseInvites = rawInvites.filter((invite) => Boolean(invite.caseId));

    const caseIds = Array.from(
      new Set(caseInvites.map((invite) => String(invite.caseId ?? "")).filter(Boolean))
    );
    const caseSnapshots = await Promise.all(
      caseIds.map(async (caseId) => [caseId, await db.collection("cases").doc(caseId).get()] as const)
    );
    const caseOwnerMap = new Map(
      caseSnapshots.map(([caseId, snap]) => [caseId, snap.data()?.ownerDisplayName ?? null])
    );

    const data = caseInvites.map((invite) => ({
      ...invite,
      caseOwnerDisplayName: caseOwnerMap.get(String(invite.caseId ?? "")) ?? null
    }));

    return jsonOk(c, data);
  });

  app.get(":caseId", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const { caseRepo } = c.get("deps");
    const cases = await caseRepo.listCasesByMemberUid(auth.uid);
    const target = cases.find((item) => item.caseId === caseId);
    if (!target) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    return jsonOk(c, target);
  });

  app.post(":caseId/invites", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = inviteCreateSchema.safeParse({
      email: body?.email,
      relationLabel: body?.relationLabel,
      relationOther: body?.relationOther,
      memo: body?.memo
    });
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const now = c.get("deps").now();
    const invitesCollection = db.collection(`cases/${caseId}/invites`);
    const resolveInviteReceiver = async (): Promise<string | null> => {
      try {
        const user = await getAuth().getUserByEmail(normalizedEmail);
        return user.uid;
      } catch (error: any) {
        if (error?.code === "auth/user-not-found") return null;
        throw error;
      }
    };
    const existingSnapshot = await invitesCollection.where("email", "==", normalizedEmail).get();
    const existingDoc = existingSnapshot.docs[0];
    if (existingDoc) {
      const existing = existingDoc.data();
      if (existing?.status === "declined") {
        await existingDoc.ref.set(
          {
            status: "pending",
            ownerDisplayName: caseSnap.data()?.ownerDisplayName ?? null,
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
          const ownerName = caseSnap.data()?.ownerDisplayName ?? "招待者";
          await notificationRef.set({
            receiverUid,
            type: "CASE_INVITE_SENT",
            title: "ケース招待が届きました",
            body: `${ownerName}さんから招待が届きました。`,
            related: { kind: "case-invite", id: existingDoc.id, caseId },
            isRead: false,
            createdAt: now
          });
        }
        return jsonOk(c, { inviteId: existingDoc.id, status: "pending" });
      }
      return jsonError(c, 409, "CONFLICT", "このメールアドレスは既に招待済みです");
    }

    const receiverUid = await resolveInviteReceiver();
    const inviteRef = invitesCollection.doc();
    await inviteRef.set({
      caseId,
      ownerUid: auth.uid,
      ownerDisplayName: caseSnap.data()?.ownerDisplayName ?? null,
      email: normalizedEmail,
      status: "pending",
      relationLabel: parsed.data.relationLabel,
      relationOther: parsed.data.relationOther?.trim() ?? null,
      memo: parsed.data.memo?.trim() ?? null,
      acceptedByUid: null,
      acceptedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now
    });

    if (receiverUid) {
      const notificationRef = db.collection("notifications").doc();
      const ownerName = caseSnap.data()?.ownerDisplayName ?? "招待者";
      await notificationRef.set({
        receiverUid,
        type: "CASE_INVITE_SENT",
        title: "ケース招待が届きました",
        body: `${ownerName}さんから招待が届きました。`,
        related: { kind: "case-invite", id: inviteRef.id, caseId },
        isRead: false,
        createdAt: now
      });
    }

    return jsonOk(c, { inviteId: inviteRef.id });
  });

  app.get(":caseId/invites", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const scope = String(c.req.query("scope") ?? "");
    if (scope !== "owner" && scope !== "received") {
      return jsonError(c, 400, "VALIDATION_ERROR", "scopeの指定が不正です");
    }
    if (scope === "received" && !auth.email) {
      return jsonError(c, 400, "VALIDATION_ERROR", "メールアドレスが登録されていません");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }

    const invitesCollection = db.collection(`cases/${caseId}/invites`);
    if (scope === "owner") {
      if (caseSnap.data()?.ownerUid !== auth.uid) {
        return jsonError(c, 403, "FORBIDDEN", "権限がありません");
      }
      const snapshot = await invitesCollection.get();
      const data = snapshot.docs.map((doc) => ({ inviteId: doc.id, ...doc.data() }));
      return jsonOk(c, data);
    }

    const normalizedEmail = normalizeEmail(auth.email ?? "");
    const snapshot = await invitesCollection.where("email", "==", normalizedEmail).get();
    const data = snapshot.docs.map((doc) => ({ inviteId: doc.id, ...doc.data() }));
    return jsonOk(c, data);
  });

  app.post(":caseId/invites/:inviteId/accept", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const inviteId = c.req.param("inviteId");
    const db = getFirestore();
    const inviteRef = db.collection(`cases/${caseId}/invites`).doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Invite not found");
    }
    const invite = inviteSnap.data() ?? {};
    if (!auth.email || normalizeEmail(auth.email) !== invite.email) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    if (invite.status === "accepted") {
      return jsonOk(c, { status: "accepted" });
    }
    if (invite.status === "declined") {
      return jsonError(c, 400, "VALIDATION_ERROR", "辞退済みの招待は受諾できません");
    }

    const now = c.get("deps").now();
    await inviteRef.set(
      {
        status: "accepted",
        acceptedByUid: auth.uid,
        acceptedAt: now,
        updatedAt: now
      },
      { merge: true }
    );

    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (caseSnap.exists) {
      const memberUids = Array.isArray(caseSnap.data()?.memberUids)
        ? [...caseSnap.data()?.memberUids]
        : [];
      if (!memberUids.includes(auth.uid)) {
        memberUids.push(auth.uid);
      }
      await caseRef.set({ memberUids }, { merge: true });
    }

    return jsonOk(c, { status: "accepted" });
  });

  app.post(":caseId/invites/:inviteId/decline", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const inviteId = c.req.param("inviteId");
    const db = getFirestore();
    const inviteRef = db.collection(`cases/${caseId}/invites`).doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Invite not found");
    }
    const invite = inviteSnap.data() ?? {};
    if (!auth.email || normalizeEmail(auth.email) !== invite.email) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    if (invite.status === "accepted") {
      return jsonError(c, 400, "VALIDATION_ERROR", "受諾済みの招待は辞退できません");
    }
    const now = c.get("deps").now();
    await inviteRef.set(
      {
        status: "declined",
        declinedAt: now,
        updatedAt: now
      },
      { merge: true }
    );
    return jsonOk(c, { status: "declined" });
  });

  app.get(":caseId/heirs", async (c) => {
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
    if (caseData.ownerUid !== auth.uid && !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const snapshot = await db
      .collection(`cases/${caseId}/invites`)
      .where("status", "==", "accepted")
      .get();
    const data = snapshot.docs.map((doc) => ({ inviteId: doc.id, ...doc.data() }));
    return jsonOk(c, data);
  });

  app.get(":caseId/task-progress", async (c) => {
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
    if (caseData.ownerUid !== auth.uid && !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const userRef = db.collection(`cases/${caseId}/taskProgressUsers`).doc(auth.uid);
    const userSnap = await userRef.get();
    const user = userSnap.data() ?? {};
    const userCompletedTaskIds = Array.isArray(user.completedTaskIds)
      ? user.completedTaskIds
      : [];

    return jsonOk(c, { userCompletedTaskIds });
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
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    const caseData = caseSnap.data() ?? {};
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    if (caseData.ownerUid !== auth.uid && !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    await db.collection(`cases/${caseId}/taskProgressUsers`).doc(auth.uid).set(
      { completedTaskIds: uniqueIds, updatedAt: c.get("deps").now() },
      { merge: true }
    );
    return jsonOk(c);
  });

  app.post(":caseId/assets", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = assetCreateSchema.safeParse({
      label: body?.label,
      address: body?.address
    });
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const now = c.get("deps").now();
    const assetRef = db.collection(`cases/${caseId}/assets`).doc();
    await assetRef.set({
      assetId: assetRef.id,
      ownerUid: auth.uid,
      label: parsed.data.label,
      address: parsed.data.address,
      verificationStatus: "UNVERIFIED",
      reserveXrp: "0",
      reserveTokens: [],
      createdAt: now,
      updatedAt: now
    });
    await appendAssetHistory(assetRef, {
      type: "ASSET_CREATED",
      title: "資産を登録しました",
      detail: parsed.data.label,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now
    });

    return jsonOk(c, { assetId: assetRef.id, label: parsed.data.label });
  });

  app.get(":caseId/assets", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    const snapshot = await db.collection(`cases/${caseId}/assets`).get();
    const data = snapshot.docs.map((doc) => {
      const asset = doc.data() ?? {};
      return {
        assetId: doc.id,
        ...asset,
        createdAt: formatDate(asset.createdAt),
        updatedAt: formatDate(asset.updatedAt)
      };
    });
    return jsonOk(c, data);
  });

  app.get(":caseId/assets/:assetId", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const assetId = c.req.param("assetId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const assetRef = db.collection(`cases/${caseId}/assets`).doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }
    const assetData = assetSnap.data() ?? {};

    const includeXrpl =
      String(c.req.query("includeXrpl") ?? c.req.query("sync") ?? "false") === "true" ||
      String(c.req.query("includeXrpl") ?? c.req.query("sync") ?? "0") === "1";

    const toXrplSummaryResponse = (summary: any) => {
      if (!summary || typeof summary !== "object") return null;
      if (summary.status === "ok") {
        const tokens = Array.isArray(summary.tokens)
          ? summary.tokens.map((token: any) => ({
              currency: String(token.currency ?? ""),
              issuer: typeof token.issuer === "string" ? token.issuer : null,
              balance: String(token.balance ?? "0")
            }))
          : [];
        return {
          status: "ok",
          balanceXrp: typeof summary.balanceXrp === "string" ? summary.balanceXrp : "0",
          ledgerIndex: summary.ledgerIndex ?? null,
          tokens,
          syncedAt: formatDate(summary.syncedAt)
        };
      }
      if (summary.status === "error") {
        return {
          status: "error",
          message: typeof summary.message === "string" ? summary.message : "XRPL error",
          syncedAt: formatDate(summary.syncedAt)
        };
      }
      return null;
    };

    let xrpl: any = null;
    const address = typeof assetData.address === "string" ? assetData.address : "";
    if (includeXrpl) {
      if (!address) {
        return jsonError(c, 400, "VALIDATION_ERROR", "アドレスが取得できません");
      }
      xrpl = await fetchXrplAccountInfo(address);
      if (xrpl.status === "ok") {
        const lines = await fetchXrplAccountLines(address);
        if (lines.status === "ok") {
          xrpl = { ...xrpl, tokens: lines.tokens };
        } else {
          xrpl = { status: "error", message: lines.message };
        }
      }
      const syncedAt = deps.now();
      const summaryToStore =
        xrpl.status === "ok"
          ? {
              status: "ok",
              balanceXrp: xrpl.balanceXrp,
              ledgerIndex: xrpl.ledgerIndex ?? null,
              tokens: xrpl.tokens ?? [],
              syncedAt
            }
          : { status: "error", message: xrpl.message, syncedAt };
      await assetRef.set({ xrplSummary: summaryToStore }, { merge: true });
      xrpl = toXrplSummaryResponse(summaryToStore);

      const logRef = assetRef.collection("syncLogs").doc();
      await logRef.set({
        status: xrpl.status,
        balanceXrp: xrpl.status === "ok" ? xrpl.balanceXrp : null,
        ledgerIndex: xrpl.status === "ok" ? xrpl.ledgerIndex ?? null : null,
        message: xrpl.status === "error" ? xrpl.message : null,
        createdAt: deps.now()
      });
      await appendAssetHistory(assetRef, {
        type: "ASSET_SYNCED",
        title: "ウォレット情報を同期しました",
        detail: xrpl.status === "ok" ? `残高 ${xrpl.balanceXrp} XRP` : xrpl.message,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null
      });
    } else {
      xrpl = toXrplSummaryResponse(assetData.xrplSummary);
    }

    const logsSnapshot = await assetRef
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

    return jsonOk(c, {
      assetId: assetSnap.id,
      label: assetData.label ?? "",
      address,
      createdAt: formatDate(assetData.createdAt),
      updatedAt: formatDate(assetData.updatedAt),
      verificationStatus: assetData.verificationStatus ?? "UNVERIFIED",
      verificationChallenge: assetData.verificationChallenge ?? null,
      verificationAddress: XRPL_VERIFY_ADDRESS,
      reserveXrp: typeof assetData.reserveXrp === "string" ? assetData.reserveXrp : "0",
      reserveTokens: Array.isArray(assetData.reserveTokens) ? assetData.reserveTokens : [],
      xrpl: xrpl ?? null,
      syncLogs
    });
  });

  app.get(":caseId/assets/:assetId/history", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const assetId = c.req.param("assetId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const assetRef = db.collection(`cases/${caseId}/assets`).doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }

    const toMillis = (value: any) => {
      if (!value) return 0;
      if (value instanceof Date) return value.getTime();
      if (typeof value.toDate === "function") return value.toDate().getTime();
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    };

    const historySnapshot = await assetRef
      .collection("history")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    const historyEntries = historySnapshot.docs.map((doc) => {
      const data = doc.data() ?? {};
      return {
        historyId: data.historyId ?? doc.id,
        type: data.type ?? "",
        title: data.title ?? "",
        detail: data.detail ?? null,
        actorUid: data.actorUid ?? null,
        actorEmail: data.actorEmail ?? null,
        createdAt: data.createdAt,
        meta: data.meta ?? null
      };
    });

    const syncSnapshot = await assetRef
      .collection("syncLogs")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    const syncEntries = syncSnapshot.docs.map((doc) => {
      const data = doc.data() ?? {};
      const detail =
        data.status === "ok"
          ? `Ledger ${data.ledgerIndex ?? "-"} / 残高 ${data.balanceXrp ?? "-"} XRP`
          : data.message ?? null;
      return {
        historyId: doc.id,
        type: "SYNC_LOG",
        title: data.status === "ok" ? "同期成功" : "同期失敗",
        detail,
        actorUid: null,
        actorEmail: null,
        createdAt: data.createdAt,
        meta: {
          status: data.status ?? null,
          ledgerIndex: data.ledgerIndex ?? null,
          balanceXrp: data.balanceXrp ?? null
        }
      };
    });

    const merged = [...historyEntries, ...syncEntries]
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .slice(0, 50)
      .map((entry) => ({ ...entry, createdAt: formatDate(entry.createdAt) }));

    return jsonOk(c, merged);
  });

  app.patch(":caseId/assets/:assetId/reserve", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const assetId = c.req.param("assetId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = assetReserveSchema.safeParse({
      reserveXrp: body?.reserveXrp,
      reserveTokens: body?.reserveTokens ?? []
    });
    if (!parsed.success) {
      return jsonError(
        c,
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "入力が不正です"
      );
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const assetRef = db.collection(`cases/${caseId}/assets`).doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }

    await assetRef.set(
      {
        reserveXrp: parsed.data.reserveXrp,
        reserveTokens: parsed.data.reserveTokens,
        updatedAt: deps.now()
      },
      { merge: true }
    );
    await appendAssetHistory(assetRef, {
      type: "ASSET_RESERVE_UPDATED",
      title: "留保設定を更新しました",
      detail: `XRP ${parsed.data.reserveXrp}`,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null
    });
    return jsonOk(c);
  });

  app.delete(":caseId/assets/:assetId", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const assetId = c.req.param("assetId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const plansSnap = await db.collection(`cases/${caseId}/plans`).get();
    const relatedPlans: Array<{ planId: string; title: string | null }> = [];
    for (const planDoc of plansSnap.docs) {
      const planId = planDoc.id;
      const planData = planDoc.data() ?? {};
      const assetsSnap = await db.collection(`cases/${caseId}/plans/${planId}/assets`).get();
      const hasRelated = assetsSnap.docs.some(
        (doc) => String(doc.data()?.assetId ?? "") === assetId
      );
      if (hasRelated) {
        relatedPlans.push({
          planId,
          title: typeof planData.title === "string" ? planData.title : null
        });
      }
    }
    if (relatedPlans.length > 0) {
      return c.json(
        {
          ok: false,
          code: "ASSET_IN_USE",
          message: "指図に紐づいているため削除できません",
          data: { relatedPlans }
        },
        409
      );
    }

    const assetRef = db.collection(`cases/${caseId}/assets`).doc(assetId);
    const assetSnap = await assetRef.get();
    if (assetSnap.exists) {
      const assetData = assetSnap.data() ?? {};
      await appendAssetHistory(assetRef, {
        type: "ASSET_DELETED",
        title: "資産を削除しました",
        detail: typeof assetData.label === "string" ? assetData.label : null,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null
      });
    }
    await assetRef.delete();
    return jsonOk(c);
  });

  app.post(":caseId/assets/:assetId/verify/challenge", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const assetId = c.req.param("assetId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const assetRef = db.collection(`cases/${caseId}/assets`).doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }

    const challenge = createChallenge();
    await assetRef.set(
      {
        verificationStatus: "PENDING",
        verificationChallenge: challenge,
        verificationIssuedAt: deps.now()
      },
      { merge: true }
    );
    await appendAssetHistory(assetRef, {
      type: "ASSET_VERIFY_REQUESTED",
      title: "所有権検証を開始しました",
      actorUid: auth.uid,
      actorEmail: auth.email ?? null
    });
    return jsonOk(c, {
      challenge,
      address: XRPL_VERIFY_ADDRESS,
      amountDrops: "1"
    });
  });

  app.post(":caseId/assets/:assetId/verify/confirm", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const assetId = c.req.param("assetId");
    const body = await c.req.json().catch(() => ({}));
    const txHash = body?.txHash;
    if (typeof txHash !== "string" || txHash.trim().length === 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "txHashは必須です");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const assetRef = db.collection(`cases/${caseId}/assets`).doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }
    const assetData = assetSnap.data() ?? {};
    const challenge = assetData.verificationChallenge as string | undefined;
    if (!challenge) {
      return jsonError(c, 400, "VERIFY_CHALLENGE_MISSING", "検証コードがありません");
    }

    const address = typeof assetData.address === "string" ? assetData.address : "";
    if (!address) {
      return jsonError(c, 400, "VALIDATION_ERROR", "アドレスが取得できません");
    }

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

    if (from !== address) {
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

    await assetRef.set(
      {
        verificationStatus: "VERIFIED",
        verificationVerifiedAt: deps.now()
      },
      { merge: true }
    );
    await appendAssetHistory(assetRef, {
      type: "ASSET_VERIFY_CONFIRMED",
      title: "所有権検証を完了しました",
      actorUid: auth.uid,
      actorEmail: auth.email ?? null
    });

    return jsonOk(c);
  });

  app.post(":caseId/plans", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = planCreateSchema.safeParse({ title: body?.title });
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const now = c.get("deps").now();
    const planRef = db.collection(`cases/${caseId}/plans`).doc();
    await planRef.set({
      planId: planRef.id,
      caseId,
      ownerUid: auth.uid,
      title: parsed.data.title,
      status: "DRAFT",
      sharedAt: null,
      heirUids: [],
      heirs: [],
      createdAt: now,
      updatedAt: now
    });

    await appendPlanHistory(planRef, {
      type: "PLAN_CREATED",
      title: "指図を作成しました",
      detail: parsed.data.title ? `タイトル: ${parsed.data.title}` : null,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        title: parsed.data.title,
        status: "DRAFT"
      }
    });

    return jsonOk(c, { planId: planRef.id, title: parsed.data.title });
  });

  app.get(":caseId/plans", async (c) => {
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
    const isOwner = caseData.ownerUid === auth.uid;
    if (!isOwner && !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const snapshot = isOwner
      ? await db.collection(`cases/${caseId}/plans`).get()
      : await db
          .collection(`cases/${caseId}/plans`)
          .where("status", "==", "SHARED")
          .get();
    const data = snapshot.docs.map((doc) => ({ planId: doc.id, ...doc.data() }));
    return jsonOk(c, data);
  });

  app.get(":caseId/plans/:planId", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    const caseData = caseSnap.data() ?? {};
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    const isOwner = caseData.ownerUid === auth.uid;
    if (!isOwner && !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    if ((planSnap.data()?.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
    }
    if (!isOwner && planSnap.data()?.status !== "SHARED") {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const plan = planSnap.data() ?? {};
    return jsonOk(c, {
      planId: planSnap.id,
      ...plan,
      heirUids: Array.isArray(plan.heirUids) ? plan.heirUids : [],
      heirs: Array.isArray(plan.heirs) ? plan.heirs : []
    });
  });

  app.get(":caseId/plans/:planId/history", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    const caseData = caseSnap.data() ?? {};
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    const isOwner = caseData.ownerUid === auth.uid;
    if (!isOwner && !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    if (!isOwner && planSnap.data()?.status !== "SHARED") {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
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
    return jsonOk(c, data);
  });

  app.post(":caseId/plans/:planId/title", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = planCreateSchema.safeParse({
      title: typeof body?.title === "string" ? body.title.trim() : body?.title
    });
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const currentTitle = planSnap.data()?.title ?? "";

    const now = c.get("deps").now();
    await planRef.set(
      {
        title: parsed.data.title,
        updatedAt: now
      },
      { merge: true }
    );
    await appendPlanHistory(planRef, {
      type: "PLAN_TITLE_UPDATED",
      title: "指図タイトルを更新しました",
      detail: parsed.data.title ? `タイトル: ${parsed.data.title}` : null,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        prevTitle: currentTitle,
        nextTitle: parsed.data.title
      }
    });

    return jsonOk(c, { title: parsed.data.title });
  });

  app.post(":caseId/plans/:planId/heirs", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const body = await c.req.json().catch(() => ({}));
    const heirUid = body?.heirUid;
    if (typeof heirUid !== "string" || heirUid.trim().length === 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "heirUidは必須です");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if ((plan.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
    }

    const inviteSnap = await db
      .collection(`cases/${caseId}/invites`)
      .where("status", "==", "accepted")
      .where("acceptedByUid", "==", heirUid)
      .get();
    if (inviteSnap.docs.length === 0) {
      return jsonError(c, 404, "NOT_FOUND", "Invite not found");
    }
    const invite = inviteSnap.docs[0]?.data() ?? {};

    const now = c.get("deps").now();
    const currentHeirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
    const currentHeirs = Array.isArray(plan.heirs) ? plan.heirs : [];
    const isNewHeir = !currentHeirUids.includes(heirUid);
    const nextHeirUids = currentHeirUids.includes(heirUid)
      ? currentHeirUids
      : [...currentHeirUids, heirUid];
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
        actorUid: auth.uid,
        actorEmail: auth.email ?? null,
        createdAt: now,
        meta: {
          heirUid,
          relationLabel: invite.relationLabel ?? "",
          relationOther: invite.relationOther ?? null,
          email: invite.email ?? ""
        }
      });
    }

    return jsonOk(c);
  });

  app.delete(":caseId/plans/:planId/heirs/:heirUid", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const heirUid = c.req.param("heirUid");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if ((plan.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
    }

    const currentHeirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
    const currentHeirs = Array.isArray(plan.heirs) ? plan.heirs : [];
    const removedHeir = currentHeirs.find((heir: any) => heir.uid === heirUid);
    if (!currentHeirUids.includes(heirUid)) {
      return jsonError(c, 404, "NOT_FOUND", "Heir not found");
    }

    const now = c.get("deps").now();
    await planRef.set(
      {
        heirUids: currentHeirUids.filter((uid: string) => uid !== heirUid),
        heirs: currentHeirs.filter((heir: any) => heir.uid !== heirUid),
        updatedAt: now
      },
      { merge: true }
    );

    const assetsSnap = await db.collection(`cases/${caseId}/plans/${planId}/assets`).get();
    await Promise.all(
      assetsSnap.docs.map(async (assetDoc) => {
        const planAsset = assetDoc.data() ?? {};
        const unitType = planAsset.unitType === "AMOUNT" ? "AMOUNT" : "PERCENT";
        const allocations = Array.isArray(planAsset.allocations) ? planAsset.allocations : [];
        const filtered = allocations.filter((allocation: any) => allocation.heirUid !== heirUid);
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

    const relationLabel = typeof removedHeir?.relationLabel === "string" ? removedHeir.relationLabel : "相続人";
    const relationOther = removedHeir?.relationOther ?? null;
    const detailParts = [relationLabel, removedHeir?.email].filter(Boolean);
    await appendPlanHistory(planRef, {
      type: "PLAN_HEIR_REMOVED",
      title: "相続人を削除しました",
      detail: detailParts.join(" / "),
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        heirUid,
        relationLabel,
        relationOther,
        email: removedHeir?.email ?? ""
      }
    });

    return jsonOk(c);
  });

  app.get(":caseId/plans/:planId/assets", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    const caseData = caseSnap.data() ?? {};
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    const isOwner = caseData.ownerUid === auth.uid;
    if (!isOwner && !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    if (!isOwner && planSnap.data()?.status !== "SHARED") {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const snapshot = await db.collection(`cases/${caseId}/plans/${planId}/assets`).get();
    const planAssets: Array<Record<string, any>> = snapshot.docs.map((doc) => ({
      planAssetId: doc.id,
      ...(doc.data() as Record<string, any>)
    }));
    const assetIds = planAssets
      .map((asset) => String(asset.assetId ?? ""))
      .filter((assetId) => assetId.length > 0);
    const assetSnaps = await Promise.all(
      assetIds.map(async (assetId) => [assetId, await db.collection(`cases/${caseId}/assets`).doc(assetId).get()] as const)
    );
    const assetMap = new Map(
      assetSnaps.map(([assetId, snap]) => [assetId, snap.data() ?? {}])
    );

    const data = planAssets.map((planAsset) => {
      const assetId = String(planAsset.assetId ?? "");
      const asset = assetMap.get(assetId) ?? {};
      return {
        planAssetId: planAsset.planAssetId,
        assetId,
        assetType: "xrp-wallet",
        assetLabel: asset.label ?? "",
        assetAddress: asset.address ?? null,
        token: null,
        unitType: planAsset.unitType ?? "PERCENT",
        allocations: Array.isArray(planAsset.allocations) ? planAsset.allocations : []
      };
    });

    return jsonOk(c, data);
  });


  app.post(":caseId/plans/:planId/assets", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const body = await c.req.json().catch(() => ({}));
    const assetId = String(body?.assetId ?? "");
    const unitType = body?.unitType === "AMOUNT" ? "AMOUNT" : "PERCENT";
    if (!assetId) {
      return jsonError(c, 400, "VALIDATION_ERROR", "資産を選択してください");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    if ((planSnap.data()?.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
    }

    const assetRef = db.collection(`cases/${caseId}/assets`).doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }
    const asset = assetSnap.data() ?? {};

    const now = c.get("deps").now();
    const planAssetRef = db.collection(`cases/${caseId}/plans/${planId}/assets`).doc();
    await planAssetRef.set({
      planAssetId: planAssetRef.id,
      assetId,
      unitType,
      allocations: [],
      createdAt: now,
      updatedAt: now
    });
    await planRef.set({ updatedAt: now }, { merge: true });
    const assetLabel = typeof asset.label === "string" ? asset.label : "資産";
    await appendPlanHistory(planRef, {
      type: "PLAN_ASSET_ADDED",
      title: "資産を追加しました",
      detail: assetLabel,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        planAssetId: planAssetRef.id,
        assetId,
        assetLabel,
        unitType
      }
    });

    return jsonOk(c, { planAssetId: planAssetRef.id });
  });

  app.post(":caseId/plans/:planId/assets/:planAssetId/allocations", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const planAssetId = c.req.param("planAssetId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = planAllocationSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    if ((planSnap.data()?.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
    }

    const { unitType, allocations } = parsed.data;
    const cleaned = allocations.map((allocation) => ({
      heirUid: allocation.heirUid,
      value: allocation.value,
      isUnallocated: allocation.isUnallocated ?? false
    }));

    const nextAllocations = normalizePlanAllocations(unitType, cleaned);

    const planAssetRef = db.collection(`cases/${caseId}/plans/${planId}/assets`).doc(planAssetId);
    await planAssetRef.set(
      {
        unitType,
        allocations: nextAllocations,
        updatedAt: c.get("deps").now()
      },
      { merge: true }
    );
    await planRef.set({ updatedAt: c.get("deps").now() }, { merge: true });
    const planAssetSnap = await planAssetRef.get();
    const planAsset = planAssetSnap.data() ?? {};
    const assetId = String(planAsset.assetId ?? "");
    const assetSnap = assetId
      ? await db.collection(`cases/${caseId}/assets`).doc(assetId).get()
      : null;
    const assetLabel = assetSnap?.data()?.label ?? "資産";
    const assignedTotal = cleaned.reduce((total, allocation) => total + allocation.value, 0);
    const unallocatedEntry = nextAllocations.find((allocation) => allocation.isUnallocated);
    const unallocatedValue = unallocatedEntry?.value ?? null;
    await appendPlanHistory(planRef, {
      type: "PLAN_ALLOCATION_UPDATED",
      title: "配分を更新しました",
      detail: assetLabel,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: c.get("deps").now(),
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
    return jsonOk(c);
  });

  app.delete(":caseId/plans/:planId/assets/:planAssetId", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const planAssetId = c.req.param("planAssetId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }

    const planAssetRef = db.collection(`cases/${caseId}/plans/${planId}/assets`).doc(planAssetId);
    const planAssetSnap = await planAssetRef.get();
    if (!planAssetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan asset not found");
    }
    const planAsset = planAssetSnap.data() ?? {};

    await planAssetRef.delete();
    const now = c.get("deps").now();
    await planRef.set({ updatedAt: now }, { merge: true });
    const assetId = String(planAsset.assetId ?? "");
    const assetSnap = assetId
      ? await db.collection(`cases/${caseId}/assets`).doc(assetId).get()
      : null;
    const assetLabel = assetSnap?.data()?.label ?? "資産";
    await appendPlanHistory(planRef, {
      type: "PLAN_ASSET_REMOVED",
      title: "資産を削除しました",
      detail: assetLabel,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        planAssetId,
        assetId,
        assetLabel,
        unitType: planAsset.unitType ?? null
      }
    });
    return jsonOk(c);
  });

  app.post(":caseId/plans/:planId/share", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }

    const currentAssets = await db.collection(`cases/${caseId}/plans/${planId}/assets`).get();
    const currentAssetIds = new Set(
      currentAssets.docs.map((doc) => String(doc.data()?.assetId ?? ""))
    );

    const sharedPlans = await db
      .collection(`cases/${caseId}/plans`)
      .where("status", "==", "SHARED")
      .get();
    for (const sharedPlan of sharedPlans.docs) {
      if (sharedPlan.id === planId) continue;
      const sharedAssets = await db
        .collection(`cases/${caseId}/plans/${sharedPlan.id}/assets`)
        .get();
      const hasOverlap = sharedAssets.docs.some((doc) =>
        currentAssetIds.has(String(doc.data()?.assetId ?? ""))
      );
      if (hasOverlap) {
        return jsonError(c, 400, "VALIDATION_ERROR", "資産が他の共有済み指図と重複しています");
      }
    }

    const now = c.get("deps").now();
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
      detail: planSnap.data()?.title ? `タイトル: ${planSnap.data()?.title}` : null,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        prevStatus: planSnap.data()?.status ?? "DRAFT",
        nextStatus: "SHARED"
      }
    });

    return jsonOk(c, { status: "SHARED" });
  });

  app.post(":caseId/plans/:planId/unshare", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    if (caseSnap.data()?.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }

    const now = c.get("deps").now();
    await planRef.set(
      {
        status: "DRAFT",
        sharedAt: null,
        updatedAt: now
      },
      { merge: true }
    );
    await appendPlanHistory(planRef, {
      type: "PLAN_UNSHARED",
      title: "共有を解除しました",
      detail: planSnap.data()?.title ? `タイトル: ${planSnap.data()?.title}` : null,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        prevStatus: planSnap.data()?.status ?? "DRAFT",
        nextStatus: "DRAFT"
      }
    });

    return jsonOk(c, { status: "DRAFT" });
  });

  return app;
};
