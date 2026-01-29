import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  assetCreateSchema,
  displayNameSchema,
  inviteCreateSchema,
  planCreateSchema
} from "@kototsute/shared";
import type { ApiBindings } from "../types.js";
import { jsonError, jsonOk } from "../utils/response.js";
import { normalizeEmail } from "../utils/email.js";

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
          await notificationRef.set({
            receiverUid,
            type: "CASE_INVITE_SENT",
            title: "ケース招待が届きました",
            body: "ケースへの招待を受け取りました。",
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
      await notificationRef.set({
        receiverUid,
        type: "CASE_INVITE_SENT",
        title: "ケース招待が届きました",
        body: "ケースへの招待を受け取りました。",
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
      createdAt: now,
      updatedAt: now
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
    const data = snapshot.docs.map((doc) => ({ assetId: doc.id, ...doc.data() }));
    return jsonOk(c, data);
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
    await db.collection(`cases/${caseId}/assets`).doc(assetId).delete();
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
      createdAt: now,
      updatedAt: now
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
    if (!isOwner && planSnap.data()?.status !== "SHARED") {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    return jsonOk(c, { planId: planSnap.id, ...planSnap.data() });
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

    const assetRef = db.collection(`cases/${caseId}/assets`).doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }

    const now = c.get("deps").now();
    const planAssetRef = db.collection(`cases/${caseId}/plans/${planId}/assets`).doc();
    await planAssetRef.set({
      planAssetId: planAssetRef.id,
      assetId,
      createdAt: now,
      updatedAt: now
    });

    return jsonOk(c, { planAssetId: planAssetRef.id });
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

    return jsonOk(c, { status: "SHARED" });
  });

  return app;
};
