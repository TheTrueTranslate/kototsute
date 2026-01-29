import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { AssetId } from "@kototsute/asset";
import { planAllocationSchema, planCreateSchema } from "@kototsute/shared";
import type { ApiBindings } from "../types";
import { jsonError, jsonOk } from "../utils/response";
import { formatDate } from "../utils/date";
import { appendPlanHistory, formatPlanToken, normalizePlanAllocations } from "../utils/plan";

export const plansRoutes = () => {
  const app = new Hono<ApiBindings>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const parsed = planCreateSchema.safeParse({
      title: typeof body?.title === "string" ? body.title.trim() : body?.title
    });
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const now = c.get("deps").now();
    const db = getFirestore();
    const doc = db.collection("plans").doc();
    const data = {
      planId: doc.id,
      ownerUid: auth.uid,
      ownerEmail: auth.email ?? null,
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
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        title: data.title,
        status: data.status
      }
    });

    return jsonOk(c, { planId: doc.id, title: data.title, status: data.status });
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const db = getFirestore();
    const snapshot = await db.collection("plans").where("ownerUid", "==", auth.uid).get();
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

    return jsonOk(c, data);
  });

  app.get(":planId", async (c) => {
    const planId = c.req.param("planId");
    const auth = c.get("auth");
    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    return jsonOk(c, {
      planId,
      title: plan.title ?? "",
      status: plan.status ?? "DRAFT",
      sharedAt: formatDate(plan.sharedAt),
      updatedAt: formatDate(plan.updatedAt),
      heirUids: plan.heirUids ?? [],
      heirs: plan.heirs ?? []
    });
  });

  app.get(":planId/history", async (c) => {
    const planId = c.req.param("planId");
    const auth = c.get("auth");
    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
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

  app.get(":planId/assets", async (c) => {
    const planId = c.req.param("planId");
    const auth = c.get("auth");
    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
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

    return jsonOk(c, data);
  });

  app.post(":planId/status", async (c) => {
    const planId = c.req.param("planId");
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const nextStatus = body?.status;
    if (nextStatus !== "DRAFT" && nextStatus !== "SHARED" && nextStatus !== "INACTIVE") {
      return jsonError(c, 400, "VALIDATION_ERROR", "statusが不正です");
    }

    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    const currentStatus = plan.status ?? "DRAFT";

    const now = c.get("deps").now();
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
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        prevStatus: currentStatus,
        nextStatus
      }
    });

    return jsonOk(c);
  });

  app.post(":planId/heirs", async (c) => {
    const planId = c.req.param("planId");
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const heirUid = body?.heirUid;
    if (typeof heirUid !== "string" || heirUid.trim().length === 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "heirUidは必須です");
    }

    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    if ((plan.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
    }

    const inviteSnap = await db
      .collection("invites")
      .where("ownerUid", "==", auth.uid)
      .where("status", "==", "accepted")
      .where("acceptedByUid", "==", heirUid)
      .get();
    if (inviteSnap.docs.length === 0) {
      return jsonError(c, 404, "NOT_FOUND", "Invite not found");
    }

    const invite = inviteSnap.docs[0]?.data() ?? {};
    const now = c.get("deps").now();
    const currentHeirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
    const isNewHeir = !currentHeirUids.includes(heirUid);
    const nextHeirUids = currentHeirUids.includes(heirUid) ? currentHeirUids : [...currentHeirUids, heirUid];
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

  app.delete(":planId/heirs/:heirUid", async (c) => {
    const planId = c.req.param("planId");
    const heirUid = c.req.param("heirUid");
    const auth = c.get("auth");
    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
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

    const assetsSnap = await planRef.collection("assets").get();
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

  app.post(":planId/assets", async (c) => {
    const planId = c.req.param("planId");
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const assetId = body?.assetId;
    const unitType = body?.unitType;
    const token = body?.token;
    if (typeof assetId !== "string" || assetId.trim().length === 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "assetIdは必須です");
    }
    if (unitType !== "PERCENT" && unitType !== "AMOUNT") {
      return jsonError(c, 400, "VALIDATION_ERROR", "unitTypeが不正です");
    }

    const deps = c.get("deps");
    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    if ((plan.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
    }

    const asset = await deps.repo.findById(AssetId.create(assetId));
    if (!asset) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }
    if (asset.getOwnerId().toString() !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
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
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: deps.now(),
      meta: {
        planAssetId: planAssetRef.id,
        assetId,
        assetLabel: asset.getLabel(),
        unitType,
        token: token ?? null
      }
    });

    return jsonOk(c, { planAssetId: planAssetRef.id });
  });

  app.post(":planId/assets/:planAssetId/allocations", async (c) => {
    const planId = c.req.param("planId");
    const planAssetId = c.req.param("planAssetId");
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const parsed = planAllocationSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    if ((plan.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
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
        updatedAt: c.get("deps").now()
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

  app.post(":planId/share", async (c) => {
    const planId = c.req.param("planId");
    const auth = c.get("auth");
    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
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
      detail: plan.title ? `タイトル: ${plan.title}` : null,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
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
    return jsonOk(c);
  });

  app.post(":planId/inactivate", async (c) => {
    const planId = c.req.param("planId");
    const auth = c.get("auth");
    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const now = c.get("deps").now();
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
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: now,
      meta: {
        prevStatus: plan.status ?? "DRAFT",
        nextStatus: "INACTIVE"
      }
    });
    return jsonOk(c);
  });

  app.delete(":planId/assets/:planAssetId", async (c) => {
    const planId = c.req.param("planId");
    const planAssetId = c.req.param("planAssetId");
    const auth = c.get("auth");
    const db = getFirestore();
    const planRef = db.collection("plans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }
    const plan = planSnap.data() ?? {};
    if (plan.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    if ((plan.status ?? "DRAFT") === "INACTIVE") {
      return jsonError(c, 400, "INACTIVE", "無効の指図は編集できません");
    }

    const planAssetRef = planRef.collection("assets").doc(planAssetId);
    const planAssetSnap = await planAssetRef.get();
    if (!planAssetSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan asset not found");
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
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      createdAt: c.get("deps").now(),
      meta: {
        planAssetId,
        assetId: planAsset.assetId ?? null,
        assetLabel,
        unitType: planAsset.unitType ?? null,
        token: planAsset.token ?? null
      }
    });
    return jsonOk(c);
  });

  return app;
};
