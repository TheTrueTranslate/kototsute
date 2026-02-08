import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import {
  assetCreateSchema,
  assetLabelUpdateSchema,
  assetReserveSchema,
  createNftSellOffer,
  createLocalXrplWallet,
  displayNameSchema,
  getWalletAddressFromSeed,
  inviteCreateSchema,
  inviteUpdateSchema,
  planAllocationSchema,
  planNftAllocationSchema,
  planCreateSchema,
  clearRegularKey,
  sendSignerListSet,
  sendTokenPayment,
  sendXrpPayment
} from "@kototsute/shared";
import type { ApiBindings } from "../types.js";
import { jsonError, jsonOk } from "../utils/response.js";
import { normalizeEmail } from "../utils/email.js";
import { formatDate } from "../utils/date.js";
import { appendPlanHistory, normalizePlanAllocations } from "../utils/plan.js";
import { appendAssetHistory } from "../utils/asset-history.js";
import {
  XRPL_URL,
  XRPL_VERIFY_ADDRESS,
  createChallenge,
  decodeHex,
  fetchXrplAccountInfo,
  fetchXrplAccountLines,
  fetchXrplAccountNfts,
  fetchXrplReserve,
  fetchXrplTx,
  fetchXrplValidatedLedgerIndex
} from "../utils/xrpl.js";
import {
  combineMultisignedBlobs,
  decodeSignedBlob,
  submitMultisignedTx
} from "../utils/xrpl-multisign.js";
import { encryptPayload } from "../utils/encryption.js";
import { decryptPayload } from "../utils/encryption.js";
import { prepareInheritanceExecution } from "../utils/inheritance-execution.js";

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDrops = (value: string) => {
  const raw = String(value ?? "0").trim();
  if (!raw) return "0";
  const sign = raw.startsWith("-") ? -1n : 1n;
  const normalized = raw.replace("-", "");
  const [wholePart, fracPart = ""] = normalized.split(".");
  const whole = BigInt(wholePart || "0");
  const frac = BigInt((`${fracPart}000000`).slice(0, 6));
  const drops = whole * 1_000_000n + frac;
  return (drops * sign).toString();
};

const toBigInt = (value: unknown, fallback = 0n) => {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return fallback;
  }
};

const isValidXrplClassicAddress = (address: string) =>
  /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);

const isAllowedDeathClaimContentType = (value: string) =>
  ["application/pdf", "image/jpeg", "image/png"].includes(value);

const maxDeathClaimFileSize = 10 * 1024 * 1024;

const createLocalXrplWalletFallback = () => {
  return createLocalXrplWallet();
};

const createXrplWallet = async () => {
  try {
    const res = await fetch(XRPL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "wallet_propose", params: [{}] })
    });
    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || payload?.result?.error) {
      throw new Error(
        payload?.result?.error_message ?? payload?.error_message ?? "XRPL wallet propose failed"
      );
    }
    const address = payload?.result?.account_id;
    const seed = payload?.result?.master_seed ?? payload?.result?.seed;
    if (typeof address !== "string" || typeof seed !== "string") {
      throw new Error("XRPL wallet propose failed");
    }
    if (!isValidXrplClassicAddress(address)) {
      throw new Error("XRPL wallet address is invalid");
    }
    return { address, seed };
  } catch {
    return createLocalXrplWalletFallback();
  }
};

type AssetLockWalletActivationStatus = "ACTIVATED" | "PENDING" | "ERROR";

const normalizeAssetLockWalletActivationStatus = (
  value: unknown
): AssetLockWalletActivationStatus | null => {
  if (value === "ACTIVATED" || value === "PENDING" || value === "ERROR") {
    return value;
  }
  return null;
};

const buildAssetLockWalletResponse = (wallet: Record<string, any> | null | undefined) => {
  const address = typeof wallet?.address === "string" ? wallet.address : "";
  if (!address) return null;
  return {
    address,
    activationStatus: normalizeAssetLockWalletActivationStatus(wallet?.activationStatus),
    activationCheckedAt: wallet?.activationCheckedAt ?? null,
    activationMessage: typeof wallet?.activationMessage === "string" ? wallet.activationMessage : null
  };
};

const resolveAssetLockWalletActivation = async (
  address: string,
  now: Date
): Promise<{
  activationStatus: AssetLockWalletActivationStatus;
  activationCheckedAt: Date;
  activationMessage: string | null;
}> => {
  const info = await fetchXrplAccountInfo(address);
  if (info.status === "ok") {
    return {
      activationStatus: "ACTIVATED",
      activationCheckedAt: now,
      activationMessage: null
    };
  }
  const message = typeof info.message === "string" ? info.message : "XRPL account info failed";
  if (/account not found/i.test(message)) {
    return {
      activationStatus: "PENDING",
      activationCheckedAt: now,
      activationMessage: message
    };
  }
  return {
    activationStatus: "ERROR",
    activationCheckedAt: now,
    activationMessage: message
  };
};

const waitForAssetLockWalletActivation = async (
  address: string,
  now: () => Date
): Promise<{
  activationStatus: AssetLockWalletActivationStatus;
  activationCheckedAt: Date;
  activationMessage: string | null;
}> => {
  const maxChecksRaw = Number(process.env.ASSET_LOCK_ACTIVATION_MAX_CHECKS ?? "5");
  const intervalMsRaw = Number(process.env.ASSET_LOCK_ACTIVATION_INTERVAL_MS ?? "300");
  const maxChecks = Number.isFinite(maxChecksRaw) ? Math.max(1, Math.floor(maxChecksRaw)) : 5;
  const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(0, Math.floor(intervalMsRaw)) : 300;
  let activation = await resolveAssetLockWalletActivation(address, now());
  for (let i = 1; i < maxChecks && activation.activationStatus === "PENDING"; i += 1) {
    if (intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    activation = await resolveAssetLockWalletActivation(address, now());
  }
  return activation;
};

const calcPlannedXrp = (asset: Record<string, any>) => {
  const balance = toNumber(asset.xrplSummary?.balanceXrp ?? 0);
  const reserve = toNumber(asset.reserveXrp ?? 0);
  const planned = Math.max(0, balance - reserve);
  return planned.toString();
};

const calcPlannedToken = (
  token: { currency?: string; issuer?: string | null; balance?: string },
  reserveTokens: Array<{ currency?: string; issuer?: string | null; reserveAmount?: string }>
) => {
  const reserveToken = reserveTokens.find(
    (item) => item.currency === token.currency && item.issuer === token.issuer
  );
  const balance = toNumber(token.balance ?? 0);
  const reserve = toNumber(reserveToken?.reserveAmount ?? 0);
  const planned = Math.max(0, balance - reserve);
  return planned.toString();
};

const resolveAssetLockSourceSnapshot = async (asset: Record<string, any>) => {
  const address = typeof asset.address === "string" ? asset.address : "";
  const cachedBalanceXrp =
    typeof asset.xrplSummary?.balanceXrp === "string" ? asset.xrplSummary.balanceXrp : null;
  const cachedTokens = Array.isArray(asset.xrplSummary?.tokens) ? asset.xrplSummary.tokens : [];
  if (address) {
    const info = await fetchXrplAccountInfo(address);
    if (info.status === "ok") {
      const lines = await fetchXrplAccountLines(address);
      return {
        balanceXrp: info.balanceXrp,
        tokens: lines.status === "ok" ? lines.tokens : cachedTokens
      };
    }
  }
  if (asset.xrplSummary?.status === "ok" && cachedBalanceXrp !== null) {
    return {
      balanceXrp: cachedBalanceXrp,
      tokens: cachedTokens
    };
  }
  return {
    balanceXrp: "0",
    tokens: []
  };
};

const createAssetLockItemsFromAssets = async (
  caseRef: any,
  assets: Array<{ assetId: string; asset: Record<string, any> }>,
  now: Date
) => {
  const items: Array<Record<string, any>> = [];
  for (const { assetId, asset } of assets) {
    const source = await resolveAssetLockSourceSnapshot(asset);
    const assetForCalc = {
      ...asset,
      xrplSummary: {
        ...(asset.xrplSummary ?? {}),
        status: "ok",
        balanceXrp: source.balanceXrp,
        tokens: source.tokens
      }
    };
    const plannedXrp = calcPlannedXrp(assetForCalc);
    if (toNumber(plannedXrp) > 0) {
      const xrpItemRef = caseRef.collection("assetLockItems").doc();
      const xrpItem = {
        itemId: xrpItemRef.id,
        assetId,
        assetLabel: asset.label ?? "",
        assetAddress: asset.address ?? "",
        token: null,
        plannedAmount: toDrops(plannedXrp),
        status: "PENDING",
        txHash: null,
        error: null,
        createdAt: now
      };
      await xrpItemRef.set(xrpItem);
      items.push(xrpItem);
    }

    const tokens = Array.isArray(assetForCalc.xrplSummary?.tokens)
      ? assetForCalc.xrplSummary.tokens
      : [];
    const reserveTokens = Array.isArray(asset.reserveTokens) ? asset.reserveTokens : [];
    for (const token of tokens) {
      const planned = calcPlannedToken(token, reserveTokens);
      if (toNumber(planned) <= 0) {
        continue;
      }
      const tokenItemRef = caseRef.collection("assetLockItems").doc();
      const tokenItem = {
        itemId: tokenItemRef.id,
        assetId,
        assetLabel: asset.label ?? "",
        assetAddress: asset.address ?? "",
        token: {
          currency: token.currency ?? "",
          issuer: token.issuer ?? null,
          isNative: false
        },
        plannedAmount: planned,
        status: "PENDING",
        txHash: null,
        error: null,
        createdAt: now
      };
      await tokenItemRef.set(tokenItem);
      items.push(tokenItem);
    }
  }
  return items;
};

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
    const countSnap = await invitesCollection.get();
    const activeCount = countSnap.docs.filter((doc) => {
      const status = doc.data()?.status;
      return status === "pending" || status === "accepted";
    }).length;
    if (activeCount >= 30) {
      return jsonError(c, 400, "HEIR_LIMIT_REACHED", "相続人は30人までです");
    }
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

  app.patch(":caseId/invites/:inviteId", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const inviteId = c.req.param("inviteId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = inviteUpdateSchema.safeParse({
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

    const inviteRef = db.collection(`cases/${caseId}/invites`).doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Invite not found");
    }

    const now = c.get("deps").now();
    await inviteRef.set(
      {
        relationLabel: parsed.data.relationLabel,
        relationOther: parsed.data.relationOther?.trim() ?? null,
        memo: parsed.data.memo?.trim() ?? null,
        updatedAt: now
      },
      { merge: true }
    );

    return jsonOk(c, { inviteId });
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
    const invites: Array<Record<string, any>> = snapshot.docs.map((doc) => ({
      inviteId: doc.id,
      ...(doc.data() as Record<string, any>)
    }));
    const walletRef = db.collection(`cases/${caseId}/heirWallets`);
    const data = await Promise.all(
      invites.map(async (invite) => {
        const heirUid = typeof invite.acceptedByUid === "string" ? invite.acceptedByUid : "";
        let walletStatus = "UNREGISTERED";
        if (heirUid) {
          const walletSnap = await walletRef.doc(heirUid).get();
          const wallet = walletSnap.data() ?? {};
          const address = typeof wallet.address === "string" ? wallet.address : "";
          const verificationStatus =
            typeof wallet.verificationStatus === "string" ? wallet.verificationStatus : "";
          if (address) {
            walletStatus = verificationStatus === "VERIFIED" ? "VERIFIED" : "PENDING";
          }
        }
        return { ...invite, walletStatus };
      })
    );
    return jsonOk(c, data);
  });

  app.get(":caseId/heir-wallet", async (c) => {
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

    const walletRef = db.collection(`cases/${caseId}/heirWallets`).doc(auth.uid);
    const walletSnap = await walletRef.get();
    const wallet = walletSnap.data() ?? {};
    const address = typeof wallet.address === "string" ? wallet.address : null;
    const verificationStatus =
      typeof wallet.verificationStatus === "string" ? wallet.verificationStatus : null;

    return jsonOk(c, {
      address,
      verificationStatus,
      verificationIssuedAt: wallet.verificationIssuedAt ?? null,
      verificationVerifiedAt: wallet.verificationVerifiedAt ?? null,
      createdAt: wallet.createdAt ?? null,
      updatedAt: wallet.updatedAt ?? null
    });
  });

  app.post(":caseId/heir-wallet", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    if (!address) {
      return jsonError(c, 400, "VALIDATION_ERROR", "addressは必須です");
    }

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

    const walletRef = db.collection(`cases/${caseId}/heirWallets`).doc(auth.uid);
    const walletSnap = await walletRef.get();
    const walletData = walletSnap.data() ?? {};
    const now = c.get("deps").now();
    const previousAddress =
      typeof walletData.address === "string" ? walletData.address : null;
    const addressChanged = previousAddress !== address;

    await walletRef.set(
      {
        address,
        createdAt: walletData.createdAt ?? now,
        updatedAt: now,
        verificationStatus: addressChanged ? null : walletData.verificationStatus ?? null,
        verificationChallenge: addressChanged ? null : walletData.verificationChallenge ?? null,
        verificationIssuedAt: addressChanged ? null : walletData.verificationIssuedAt ?? null,
        verificationVerifiedAt: addressChanged ? null : walletData.verificationVerifiedAt ?? null
      },
      { merge: true }
    );

    return jsonOk(c, { address });
  });

  app.post(":caseId/heir-wallet/verify/challenge", async (c) => {
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

    const walletRef = db.collection(`cases/${caseId}/heirWallets`).doc(auth.uid);
    const walletSnap = await walletRef.get();
    if (!walletSnap.exists) {
      return jsonError(c, 400, "VALIDATION_ERROR", "ウォレットが未登録です");
    }
    const walletData = walletSnap.data() ?? {};
    const address = typeof walletData.address === "string" ? walletData.address : "";
    if (!address) {
      return jsonError(c, 400, "VALIDATION_ERROR", "ウォレットが未登録です");
    }

    const challenge = createChallenge();
    await walletRef.set(
      {
        verificationStatus: "PENDING",
        verificationChallenge: challenge,
        verificationIssuedAt: c.get("deps").now()
      },
      { merge: true }
    );

    return jsonOk(c, {
      challenge,
      address: XRPL_VERIFY_ADDRESS,
      amountDrops: "1"
    });
  });

  app.post(":caseId/heir-wallet/verify/confirm", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const txHash = typeof body?.txHash === "string" ? body.txHash.trim() : "";
    if (!txHash) {
      return jsonError(c, 400, "VALIDATION_ERROR", "txHashは必須です");
    }

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

    const walletRef = db.collection(`cases/${caseId}/heirWallets`).doc(auth.uid);
    const walletSnap = await walletRef.get();
    if (!walletSnap.exists) {
      return jsonError(c, 400, "VALIDATION_ERROR", "ウォレットが未登録です");
    }
    const walletData = walletSnap.data() ?? {};
    const address = typeof walletData.address === "string" ? walletData.address : "";
    const challenge =
      typeof walletData.verificationChallenge === "string"
        ? walletData.verificationChallenge
        : "";
    if (!address || !challenge) {
      return jsonError(c, 400, "VERIFY_CHALLENGE_MISSING", "検証コードがありません");
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

    await walletRef.set(
      {
        verificationStatus: "VERIFIED",
        verificationVerifiedAt: c.get("deps").now(),
        updatedAt: c.get("deps").now()
      },
      { merge: true }
    );

    return jsonOk(c);
  });

  app.get(":caseId/death-claims", async (c) => {
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

    const claimsSnap = await db
      .collection(`cases/${caseId}/deathClaims`)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    const claimDoc = claimsSnap.docs[0];
    if (!claimDoc) {
      return jsonOk(c, {
        claim: null,
        files: [],
        confirmationsCount: 0,
        requiredCount: 0,
        confirmedByMe: false
      });
    }

    const filesSnap = await claimDoc.ref.collection("files").get();
    const files = filesSnap.docs.map((doc) => ({ fileId: doc.id, ...doc.data() }));

    const confirmationsSnap = await claimDoc.ref.collection("confirmations").get();
    const confirmationsCount = confirmationsSnap.docs.length;
    const heirCount = Math.max(0, memberUids.length - 1);
    const requiredCount = heirCount === 0 ? 0 : Math.floor(heirCount / 2) + 1;
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
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    const caseData = caseSnap.data() ?? {};
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    if (caseData.ownerUid === auth.uid || !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const submittedSnap = await db
      .collection(`cases/${caseId}/deathClaims`)
      .where("status", "==", "SUBMITTED")
      .get();
    const approvedSnap = await db
      .collection(`cases/${caseId}/deathClaims`)
      .where("status", "==", "ADMIN_APPROVED")
      .get();
    if (submittedSnap.docs.length > 0 || approvedSnap.docs.length > 0) {
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

  app.post(":caseId/death-claims/:claimId/upload-requests", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const claimId = c.req.param("claimId");
    const body = await c.req.json().catch(() => ({}));
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const contentType = typeof body?.contentType === "string" ? body.contentType : "";
    const size = Number(body?.size ?? 0);
    if (
      !fileName ||
      !isAllowedDeathClaimContentType(contentType) ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > maxDeathClaimFileSize
    ) {
      return jsonError(c, 400, "VALIDATION_ERROR", "ファイル形式またはサイズが不正です");
    }

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

    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Claim not found");
    }
    const claimStatus = claimSnap.data()?.status;
    if (claimStatus !== "SUBMITTED" && claimStatus !== "ADMIN_REJECTED") {
      return jsonError(
        c,
        400,
        "VALIDATION_ERROR",
        "提出済みまたは差し戻しの申請のみ追加できます"
      );
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
    if (!requestId) {
      return jsonError(c, 400, "VALIDATION_ERROR", "requestIdは必須です");
    }

    const db = getFirestore();
    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
    const requestRef = claimRef.collection("uploadRequests").doc(requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Upload request not found");
    }
    const request = requestSnap.data() ?? {};
    if (request.uid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

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

  app.get(":caseId/death-claims/:claimId/files/:fileId/download", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const claimId = c.req.param("claimId");
    const fileId = c.req.param("fileId");
    const db = getFirestore();
    const caseSnap = await db.collection("cases").doc(caseId).get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    const caseData = caseSnap.data() ?? {};
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    if (caseData.ownerUid !== auth.uid && !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const fileSnap = await db
      .collection(`cases/${caseId}/deathClaims/${claimId}/files`)
      .doc(fileId)
      .get();
    if (!fileSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "File not found");
    }
    const fileData = fileSnap.data() ?? {};
    const storagePath = typeof fileData.storagePath === "string" ? fileData.storagePath : null;
    const storageBucket = process.env.STORAGE_BUCKET;
    if (!storagePath || !storageBucket) {
      return jsonError(c, 400, "VALIDATION_ERROR", "storagePathがありません");
    }
    const [buffer] = await getStorage().bucket(storageBucket).file(storagePath).download();
    const dataBase64 = Buffer.from(buffer).toString("base64");
    return jsonOk(c, {
      fileName: fileData.fileName ?? null,
      contentType: fileData.contentType ?? "application/octet-stream",
      dataBase64
    });
  });

  app.post(":caseId/death-claims/:claimId/admin-approve", async (c) => {
    const auth = c.get("auth");
    if (!auth.admin) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    const caseId = c.req.param("caseId");
    const claimId = c.req.param("claimId");
    const db = getFirestore();
    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Claim not found");
    }

    const now = c.get("deps").now();
    await claimRef.set(
      {
        status: "ADMIN_APPROVED",
        adminApprovedByUid: auth.uid,
        adminApprovedAt: now,
        updatedAt: now
      },
      { merge: true }
    );

    return jsonOk(c);
  });

  app.post(":caseId/death-claims/:claimId/admin-reject", async (c) => {
    const auth = c.get("auth");
    if (!auth.admin) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    const caseId = c.req.param("caseId");
    const claimId = c.req.param("claimId");
    const body = await c.req.json().catch(() => ({}));
    const note = typeof body?.note === "string" ? body.note.trim() : null;
    const db = getFirestore();
    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Claim not found");
    }

    const now = c.get("deps").now();
    await claimRef.set(
      {
        status: "ADMIN_REJECTED",
        adminReview: {
          status: "REJECTED",
          note,
          reviewedByUid: auth.uid,
          reviewedAt: now
        },
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
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    const caseData = caseSnap.data() ?? {};
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    if (caseData.ownerUid === auth.uid || !memberUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Claim not found");
    }
    if (claimSnap.data()?.status !== "ADMIN_REJECTED") {
      return jsonError(c, 400, "VALIDATION_ERROR", "差し戻し中のみ再提出できます");
    }

    const now = c.get("deps").now();
    await claimRef.set(
      {
        status: "SUBMITTED",
        adminReview: null,
        updatedAt: now
      },
      { merge: true }
    );

    const confirmationsSnap = await claimRef.collection("confirmations").get();
    await Promise.all(confirmationsSnap.docs.map((doc) => doc.ref.delete()));

    return jsonOk(c);
  });

  app.post(":caseId/death-claims/:claimId/confirm", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const claimId = c.req.param("claimId");
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

    const claimRef = db.collection(`cases/${caseId}/deathClaims`).doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Claim not found");
    }
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
      await claimRef.set(
        { status: "CONFIRMED", confirmedAt: now, updatedAt: now },
        { merge: true }
      );
      await caseRef.set({ stage: "IN_PROGRESS", updatedAt: now }, { merge: true });
      try {
        await prepareInheritanceExecution({
          caseRef,
          caseData: { ...caseData, stage: "IN_PROGRESS" },
          now
        });
      } catch (error) {
        console.warn("prepareInheritanceExecution failed on confirm", error);
      }
    }

    return jsonOk(c, { confirmationsCount, requiredCount });
  });

  app.post(":caseId/signer-list/prepare", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const force = body?.force === true;
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
    const hasUnverified = walletSnaps.some((snap) => {
      const data = snap.data() ?? {};
      const address = typeof data.address === "string" ? data.address : "";
      return !address || data.verificationStatus !== "VERIFIED";
    });
    if (hasUnverified) {
      return jsonError(
        c,
        400,
        "HEIR_WALLET_UNVERIFIED",
        "相続人の受取用ウォレットが未確認です"
      );
    }

    const now = c.get("deps").now();
    const result = await prepareInheritanceExecution({
      caseRef,
      caseData,
      now,
      force
    });
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
        case "APPROVAL_NOT_EXPIRED":
          return jsonError(c, 400, "NOT_READY", "送信中のため再準備できません");
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

  app.get(":caseId/signer-list/approval-tx", async (c) => {
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

    const approvalSnap = await caseRef.collection("signerList").doc("approvalTx").get();
    if (!approvalSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "ApprovalTx not found");
    }
    const approval = approvalSnap.data() ?? {};
    const submittedTxHash =
      typeof approval.submittedTxHash === "string" ? approval.submittedTxHash : null;
    let networkStatus:
      | "PENDING"
      | "VALIDATED"
      | "FAILED"
      | "NOT_FOUND"
      | "EXPIRED"
      | null = null;
    let networkResult: string | null = null;
    if (approval.status === "SUBMITTED" && submittedTxHash) {
      const result = await fetchXrplTx(submittedTxHash);
      if (!result.ok) {
        networkStatus = "NOT_FOUND";
      } else {
        const tx = result.tx as any;
        const validated = Boolean(tx?.validated);
        networkResult =
          typeof tx?.meta?.TransactionResult === "string"
            ? tx.meta.TransactionResult
            : null;
        if (!validated) {
          const lastLedgerRaw = tx?.LastLedgerSequence;
          const lastLedger =
            typeof lastLedgerRaw === "number"
              ? lastLedgerRaw
              : typeof lastLedgerRaw === "string"
                ? Number(lastLedgerRaw)
                : NaN;
          if (Number.isFinite(lastLedger)) {
            const ledgerResult = await fetchXrplValidatedLedgerIndex();
            if (ledgerResult.ok && ledgerResult.ledgerIndex >= lastLedger) {
              networkStatus = "EXPIRED";
            } else {
              networkStatus = "PENDING";
            }
          } else {
            networkStatus = "PENDING";
          }
        } else if (networkResult && networkResult !== "tesSUCCESS") {
          networkStatus = "FAILED";
        } else {
          networkStatus = "VALIDATED";
        }
      }
    }
    return jsonOk(c, {
      memo: approval.memo ?? null,
      txJson: approval.txJson ?? null,
      status: approval.status ?? null,
      systemSignedHash: approval.systemSignedHash ?? null,
      submittedTxHash,
      networkStatus,
      networkResult
    });
  });

  app.get(":caseId/signer-list", async (c) => {
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

    const signerRef = caseRef.collection("signerList").doc("state");
    const signerSnap = await signerRef.get();
    const signerData = signerSnap.data() ?? null;
    const status = signerData?.status ?? "NOT_READY";
    const error = signerData?.error ?? null;
    const entries = Array.isArray(signerData?.entries) ? signerData?.entries : [];
    const systemSignerAddress = process.env.XRPL_SYSTEM_SIGNER_ADDRESS ?? null;
    const signaturesSnap = await signerRef.collection("signatures").get();
    const signaturesCount = signaturesSnap.docs.length;
    const signedByMe = signaturesSnap.docs.some((doc) => doc.id === auth.uid);
    const heirCount = Math.max(0, memberUids.length - 1);
    const requiredCount = Math.max(1, Math.floor(heirCount / 2) + 1);

    return jsonOk(c, {
      status,
      quorum: signerData?.quorum ?? null,
      error,
      entries,
      systemSignerAddress,
      signaturesCount,
      requiredCount,
      signedByMe
    });
  });

  app.get(":caseId/distribution", async (c) => {
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

    const stateSnap = await caseRef.collection("distribution").doc("state").get();
    const state = stateSnap.data() ?? {};

    const toCount = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : 0;

    return jsonOk(c, {
      status: typeof state.status === "string" ? state.status : "PENDING",
      totalCount: toCount(state.totalCount),
      successCount: toCount(state.successCount),
      failedCount: toCount(state.failedCount),
      skippedCount: toCount(state.skippedCount),
      escalationCount: toCount(state.escalationCount),
      retryLimit: toCount(state.retryLimit),
      startedAt: state.startedAt ?? null,
      lastProcessedAt: state.lastProcessedAt ?? null,
      updatedAt: state.updatedAt ?? null
    });
  });

  app.get(":caseId/distribution/items", async (c) => {
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

    const itemsSnap = await caseRef
      .collection("distribution")
      .doc("state")
      .collection("items")
      .get();
    const items = itemsSnap.docs.map((doc) => ({
      itemId: doc.id,
      ...(doc.data() ?? {})
    }));

    return jsonOk(c, items);
  });

  app.post(":caseId/distribution/execute", async (c) => {
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
      return jsonError(c, 400, "NOT_READY", "相続中のみ実行できます");
    }

    const approvalSnap = await caseRef.collection("signerList").doc("approvalTx").get();
    const approval = approvalSnap.data() ?? {};
    const submittedTxHash =
      typeof approval.submittedTxHash === "string" ? approval.submittedTxHash : null;
    if (approval.status !== "SUBMITTED" || !submittedTxHash) {
      return jsonError(c, 400, "NOT_READY", "相続実行の同意が完了していません");
    }
    const approvalTxResult = await fetchXrplTx(submittedTxHash);
    if (!approvalTxResult.ok) {
      return jsonError(c, 400, "NOT_READY", "相続実行の同意トランザクションを確認できません");
    }
    const approvalTx = approvalTxResult.tx as any;
    const approvalValidated = Boolean(approvalTx?.validated);
    const approvalResult =
      typeof approvalTx?.meta?.TransactionResult === "string"
        ? approvalTx.meta.TransactionResult
        : null;
    if (!approvalValidated) {
      const lastLedgerRaw = approvalTx?.LastLedgerSequence;
      const lastLedger =
        typeof lastLedgerRaw === "number"
          ? lastLedgerRaw
          : typeof lastLedgerRaw === "string"
            ? Number(lastLedgerRaw)
            : NaN;
      if (Number.isFinite(lastLedger)) {
        const ledgerResult = await fetchXrplValidatedLedgerIndex();
        if (ledgerResult.ok && ledgerResult.ledgerIndex >= lastLedger) {
          return jsonError(
            c,
            400,
            "NOT_READY",
            "相続実行の同意トランザクションの期限が切れています"
          );
        }
      }
      return jsonError(c, 400, "NOT_READY", "相続実行の同意トランザクションが未検証です");
    }
    if (approvalResult && approvalResult !== "tesSUCCESS") {
      return jsonError(c, 400, "NOT_READY", "相続実行の同意トランザクションが失敗しています");
    }

    const heirUids = memberUids.filter((uid) => uid !== caseData.ownerUid);
    if (heirUids.length === 0) {
      return jsonError(c, 400, "HEIR_MISSING", "相続人が未登録です");
    }
    const heirWalletSnaps = await Promise.all(
      heirUids.map((uid) => caseRef.collection("heirWallets").doc(uid).get())
    );
    const heirWallets = heirWalletSnaps.map((snap, index) => {
      const data = snap.data() ?? {};
      const address = typeof data.address === "string" ? data.address : "";
      const verified = data.verificationStatus === "VERIFIED" && address.length > 0;
      return { uid: heirUids[index] ?? "", address, verified };
    });
    if (heirWallets.some((wallet) => !wallet.verified)) {
      return jsonError(c, 400, "HEIR_WALLET_UNVERIFIED", "相続人の受取用ウォレットが未確認です");
    }
    const heirWalletMap = new Map(
      heirWallets.map((wallet) => [wallet.uid, wallet.address])
    );

    const lockSnap = await caseRef.collection("assetLock").doc("state").get();
    const lockData = lockSnap.data() ?? {};
    const lockWalletAddress = lockData?.wallet?.address;
    const lockSeedEncrypted = lockData?.wallet?.seedEncrypted;
    if (!lockWalletAddress || !lockSeedEncrypted) {
      return jsonError(c, 400, "VALIDATION_ERROR", "分配用ウォレットが未設定です");
    }
    const lockSeed = decryptPayload(lockSeedEncrypted);

    const stateRef = caseRef.collection("distribution").doc("state");
    const itemsRef = stateRef.collection("items");
    const existingStateSnap = await stateRef.get();
    const existingState = existingStateSnap.data() ?? {};
    const existingStatus = typeof existingState.status === "string" ? existingState.status : null;
    if (
      existingStateSnap.exists &&
      existingStatus &&
      ["RUNNING", "PARTIAL", "FAILED"].includes(existingStatus)
    ) {
      const retryLimit =
        typeof existingState.retryLimit === "number" && Number.isFinite(existingState.retryLimit)
          ? existingState.retryLimit
          : 3;
      const itemsSnap = await itemsRef.get();
      if (!itemsSnap.empty) {
        const now = c.get("deps").now();
        const retryCandidates = itemsSnap.docs.map((doc) => {
          const item = doc.data() ?? {};
          const status = String(item.status ?? "QUEUED");
          const attempts =
            typeof item.attempts === "number" && Number.isFinite(item.attempts)
              ? item.attempts
              : 0;
          return { doc, item, status, attempts };
        });
        const itemsToAttempt = retryCandidates.filter(({ status, attempts }) => {
          if (status === "VERIFIED") return false;
          if (status === "SKIPPED") return false;
          if (status === "FAILED" && attempts >= retryLimit) return false;
          return true;
        });
        const adjustedAmounts = new Map<string, string>();
        if (itemsToAttempt.length > 0) {
          const totalXrpDrops = itemsToAttempt.reduce((total, { item }) => {
            if (item.token || item.type === "NFT") return total;
            const amountDrops = BigInt(item.amount ?? "0");
            return total + amountDrops;
          }, 0n);
          if (totalXrpDrops > 0n) {
            const feePerTxDrops = 12n;
            const reserveInfo = await fetchXrplReserve();
            const reserveBaseDrops =
              reserveInfo.status === "ok"
                ? BigInt(reserveInfo.reserveBaseDrops)
                : BigInt(toDrops(process.env.XRPL_RESERVE_BASE_XRP ?? "10"));
            const reserveIncDrops =
              reserveInfo.status === "ok"
                ? BigInt(reserveInfo.reserveIncDrops)
                : BigInt(toDrops(process.env.XRPL_RESERVE_INC_XRP ?? "2"));
            const accountInfo = await fetchXrplAccountInfo(lockWalletAddress);
            if (accountInfo.status !== "ok") {
              return jsonError(c, 400, "XRPL_ACCOUNT_INFO_FAILED", accountInfo.message);
            }
            const ownerCount =
              typeof accountInfo.ownerCount === "number" &&
              Number.isFinite(accountInfo.ownerCount)
                ? accountInfo.ownerCount
                : 0;
            const balanceDrops = BigInt(toDrops(accountInfo.balanceXrp));
            const requiredReserveDrops =
              reserveBaseDrops + reserveIncDrops * BigInt(ownerCount);
            const feeDrops = BigInt(itemsToAttempt.length) * feePerTxDrops;
            const availableDrops = balanceDrops - requiredReserveDrops - feeDrops;
            if (availableDrops <= 0n) {
              return jsonError(c, 400, "NOT_READY", "送金元の残高が不足しています");
            }
            if (totalXrpDrops > availableDrops) {
              for (const { doc, item } of itemsToAttempt) {
                if (item.token || item.type === "NFT") continue;
                const amountDrops = BigInt(item.amount ?? "0");
                const adjustedDrops =
                  (amountDrops * availableDrops) / totalXrpDrops;
                adjustedAmounts.set(doc.id, adjustedDrops.toString());
              }
            }
          }
        }

        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let escalationCount = 0;
        for (const doc of itemsSnap.docs) {
          const item = doc.data() ?? {};
          const status = String(item.status ?? "QUEUED");
          const attempts =
            typeof item.attempts === "number" && Number.isFinite(item.attempts)
              ? item.attempts
              : 0;
          if (status === "VERIFIED") {
            successCount += 1;
            continue;
          }
          if (status === "SKIPPED") {
            skippedCount += 1;
            escalationCount += 1;
            continue;
          }
          if (status === "FAILED" && attempts >= retryLimit) {
            skippedCount += 1;
            escalationCount += 1;
            await doc.ref.set(
              {
                status: "SKIPPED",
                updatedAt: now,
                error: item.error ?? "再試行回数上限に達しました"
              },
              { merge: true }
            );
            continue;
          }

          try {
            if (item.type === "NFT") {
              const result = await createNftSellOffer({
                sellerSeed: lockSeed,
                sellerAddress: lockWalletAddress,
                tokenId: String(item.tokenId ?? ""),
                destinationAddress: String(item.heirAddress ?? ""),
                amountDrops: "0"
              });
              await doc.ref.set(
                {
                  status: "VERIFIED",
                  offerId: result.offerId ?? null,
                  txHash: result.txHash ?? null,
                  updatedAt: now
                },
                { merge: true }
              );
            } else if (item.token) {
              const amount = String(item.amount ?? "0");
              const result = await sendTokenPayment({
                fromSeed: lockSeed,
                fromAddress: lockWalletAddress,
                to: String(item.heirAddress ?? ""),
                token: item.token,
                amount
              });
              await doc.ref.set(
                {
                  status: "VERIFIED",
                  amount,
                  txHash: result.txHash ?? null,
                  updatedAt: now
                },
                { merge: true }
              );
            } else {
              const amount = adjustedAmounts.get(doc.id) ?? String(item.amount ?? "0");
              const result = await sendXrpPayment({
                fromSeed: lockSeed,
                fromAddress: lockWalletAddress,
                to: String(item.heirAddress ?? ""),
                amountDrops: amount
              });
              await doc.ref.set(
                {
                  status: "VERIFIED",
                  amount,
                  txHash: result.txHash ?? null,
                  updatedAt: now
                },
                { merge: true }
              );
            }
            successCount += 1;
          } catch (error: any) {
            failedCount += 1;
            await doc.ref.set(
              {
                status: "FAILED",
                amount: adjustedAmounts.get(doc.id) ?? String(item.amount ?? "0"),
                attempts: attempts + 1,
                error: error?.message ?? "送金に失敗しました",
                updatedAt: now
              },
              { merge: true }
            );
          }
        }

        const status =
          failedCount > 0 || skippedCount > 0 ? "PARTIAL" : "COMPLETED";
        const updatedAt = c.get("deps").now();
        await stateRef.set(
          {
            status,
            successCount,
            failedCount,
            skippedCount,
            escalationCount,
            updatedAt
          },
          { merge: true }
        );
        if (status === "COMPLETED") {
          await caseRef.set({ stage: "COMPLETED", updatedAt }, { merge: true });
        }

        return jsonOk(c, {
          status,
          totalCount: itemsSnap.docs.length,
          successCount,
          failedCount,
          skippedCount,
          escalationCount,
          startedAt: existingState.startedAt ?? null,
          updatedAt
        });
      }
    }

    const planSnap = await caseRef.collection("plans").get();
    const eligiblePlans = planSnap.docs.filter((doc) => {
      const plan = doc.data() ?? {};
      const heirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
      return heirUids.length > 0;
    });
    if (eligiblePlans.length === 0) {
      return jsonError(c, 400, "NOT_READY", "相続対象の指図がありません");
    }

    const assetLockItemsSnap = await caseRef.collection("assetLockItems").get();
    if (assetLockItemsSnap.empty) {
      return jsonError(c, 400, "NOT_READY", "分配対象の資産がありません");
    }

    type AssetTotals = {
      assetLabel: string;
      xrpDrops: bigint;
      tokens: Map<string, { amount: number; token: { currency: string; issuer: string | null; isNative: boolean } }>;
    };
    const assetTotals = new Map<string, AssetTotals>();
    const assetCache = new Map<string, Record<string, any>>();

    assetLockItemsSnap.docs.forEach((doc) => {
      const item = doc.data() ?? {};
      const assetId = typeof item.assetId === "string" ? item.assetId : "";
      if (!assetId) return;
      const assetLabel = typeof item.assetLabel === "string" ? item.assetLabel : "";
      const token = item.token ?? null;
      const plannedAmount = String(item.plannedAmount ?? "0");
      const current = assetTotals.get(assetId) ?? {
        assetLabel,
        xrpDrops: 0n,
        tokens: new Map()
      };
      if (token) {
        const currency = String(token.currency ?? "");
        const issuer = token.issuer ?? null;
        const key = `${currency}:${issuer ?? ""}`;
        const amount = toNumber(plannedAmount);
        if (amount > 0) {
          current.tokens.set(key, {
            amount,
            token: { currency, issuer, isNative: false }
          });
        }
      } else {
        const drops = BigInt(plannedAmount || "0");
        if (drops > 0n) {
          current.xrpDrops += drops;
        }
      }
      assetTotals.set(assetId, current);
    });

    const distributionItems: Array<Record<string, any>> = [];
    const now = c.get("deps").now();
    const percentScale = 1_000_000n;
    type AssetNftInfo = { tokenId: string; issuer: string | null; uri: string | null };
    const formatTokenAmount = (value: number) => {
      const fixed = value.toFixed(6);
      return fixed.replace(/\.?0+$/, "") || "0";
    };
    const getAssetData = async (assetId: string) => {
      const cached = assetCache.get(assetId);
      if (cached) return cached;
      const snap = await caseRef.collection("assets").doc(assetId).get();
      const data = snap.data() ?? {};
      assetCache.set(assetId, data);
      return data;
    };

    for (const planDoc of eligiblePlans) {
      const plan = planDoc.data() ?? {};
      const planId = plan.planId ?? planDoc.id;
      const planTitle = typeof plan.title === "string" ? plan.title : "";
      const planAssetsSnap = await planDoc.ref.collection("assets").get();
      for (const assetDoc of planAssetsSnap.docs) {
        const asset = assetDoc.data() ?? {};
        const assetId = typeof asset.assetId === "string" ? asset.assetId : "";
        if (!assetId) continue;
        const totals = assetTotals.get(assetId);
        if (!totals) continue;
        const unitType = asset.unitType === "AMOUNT" ? "AMOUNT" : "PERCENT";
        const allocations = Array.isArray(asset.allocations) ? asset.allocations : [];
        const nftAllocations = Array.isArray(asset.nftAllocations) ? asset.nftAllocations : [];
        const xrpTotal = totals.xrpDrops;
        const xrpTotalNumber = Number(xrpTotal) / 1_000_000;

        const allocationEntries = allocations.filter(
          (allocation: any) => allocation?.heirUid && !allocation?.isUnallocated
        );

        const xrpAmountsByHeir = new Map<string, bigint>();
        let allocatedTotal = 0n;
        for (const allocation of allocationEntries) {
          const heirUid = String(allocation.heirUid ?? "");
          const value = toNumber(allocation.value);
          let amountDrops = 0n;
          if (unitType === "AMOUNT") {
            amountDrops = BigInt(toDrops(value.toString()));
          } else {
            const ratioScaled = BigInt(Math.round((value / 100) * Number(percentScale)));
            amountDrops = (xrpTotal * ratioScaled) / percentScale;
          }
          if (amountDrops > 0n) {
            xrpAmountsByHeir.set(heirUid, amountDrops);
            allocatedTotal += amountDrops;
          }
        }

        if (xrpTotal > 0n && allocatedTotal > xrpTotal) {
          return jsonError(c, 400, "VALIDATION_ERROR", "分配額が資産残高を超えています");
        }

        for (const allocation of allocationEntries) {
          const heirUid = String(allocation.heirUid ?? "");
          const heirAddress = heirWalletMap.get(heirUid) ?? "";
          if (!heirAddress) continue;
          const amountDrops = xrpAmountsByHeir.get(heirUid) ?? 0n;
          if (amountDrops > 0n) {
            distributionItems.push({
              status: "QUEUED",
              planId,
              planTitle,
              assetId,
              assetLabel: totals.assetLabel,
              heirUid,
              heirAddress,
              token: null,
              amount: amountDrops.toString(),
              attempts: 0,
              txHash: null,
              error: null,
              createdAt: now,
              updatedAt: now
            });
          }
          for (const tokenEntry of totals.tokens.values()) {
            let ratio = 0;
            if (unitType === "PERCENT") {
              ratio = toNumber(allocation.value) / 100;
            } else {
              ratio = xrpTotalNumber > 0 ? toNumber(allocation.value) / xrpTotalNumber : 0;
            }
            const tokenAmount = tokenEntry.amount * ratio;
            if (tokenAmount > 0) {
              distributionItems.push({
                status: "QUEUED",
                type: "TOKEN",
                planId,
                planTitle,
                assetId,
                assetLabel: totals.assetLabel,
                heirUid,
                heirAddress,
                token: tokenEntry.token,
                amount: formatTokenAmount(tokenAmount),
                attempts: 0,
                txHash: null,
                error: null,
                createdAt: now,
                updatedAt: now
              });
            }
          }
        }

        if (nftAllocations.length > 0) {
          const assetData = await getAssetData(assetId);
          const reserveNfts = Array.isArray(assetData.reserveNfts) ? assetData.reserveNfts : [];
          const reserveSet = new Set(reserveNfts.map((id: any) => String(id)));
          const assetNfts: AssetNftInfo[] = Array.isArray(assetData.xrplSummary?.nfts)
            ? assetData.xrplSummary.nfts
                .map((nft: any): AssetNftInfo => ({
                  tokenId: String(nft.tokenId ?? ""),
                  issuer: typeof nft.issuer === "string" ? nft.issuer : null,
                  uri: typeof nft.uri === "string" ? nft.uri : null
                }))
                .filter((nft: AssetNftInfo) => nft.tokenId && !reserveSet.has(nft.tokenId))
            : [];
          const nftMap = new Map<string, AssetNftInfo>(
            assetNfts.map((nft) => [nft.tokenId, nft])
          );
          for (const allocation of nftAllocations) {
            const tokenId = String(allocation?.tokenId ?? "");
            if (!tokenId) continue;
            if (reserveSet.has(tokenId)) continue;
            const nft = nftMap.get(tokenId);
            if (!nft) continue;
            const heirUid = String(allocation?.heirUid ?? "");
            const heirAddress = heirWalletMap.get(heirUid) ?? "";
            if (!heirAddress) continue;
            distributionItems.push({
              status: "QUEUED",
              type: "NFT",
              planId,
              planTitle,
              assetId,
              assetLabel: totals.assetLabel,
              heirUid,
              heirAddress,
              tokenId,
              issuer: nft.issuer ?? null,
              nftUri: nft.uri ?? null,
              offerId: null,
              amount: "0",
              attempts: 0,
              txHash: null,
              error: null,
              createdAt: now,
              updatedAt: now
            });
          }
        }
      }
    }

    if (distributionItems.length === 0) {
      return jsonError(c, 400, "NOT_READY", "分配対象がありません");
    }

    const feePerTxDrops = 12n;
    const reserveInfo = await fetchXrplReserve();
    const reserveBaseDrops =
      reserveInfo.status === "ok"
        ? BigInt(reserveInfo.reserveBaseDrops)
        : BigInt(toDrops(process.env.XRPL_RESERVE_BASE_XRP ?? "10"));
    const reserveIncDrops =
      reserveInfo.status === "ok"
        ? BigInt(reserveInfo.reserveIncDrops)
        : BigInt(toDrops(process.env.XRPL_RESERVE_INC_XRP ?? "2"));
    const accountInfo = await fetchXrplAccountInfo(lockWalletAddress);
    if (accountInfo.status !== "ok") {
      return jsonError(c, 400, "XRPL_ACCOUNT_INFO_FAILED", accountInfo.message);
    }
    const ownerCount =
      typeof accountInfo.ownerCount === "number" && Number.isFinite(accountInfo.ownerCount)
        ? accountInfo.ownerCount
        : 0;
    const balanceDrops = BigInt(toDrops(accountInfo.balanceXrp));
    const requiredReserveDrops = reserveBaseDrops + reserveIncDrops * BigInt(ownerCount);
    const feeDrops = BigInt(distributionItems.length) * feePerTxDrops;
    const availableDrops = balanceDrops - requiredReserveDrops - feeDrops;
    if (availableDrops <= 0n) {
      return jsonError(c, 400, "NOT_READY", "送金元の残高が不足しています");
    }
    const totalXrpDrops = distributionItems.reduce((total, item) => {
      if (item.token || item.type === "NFT") return total;
      const amountDrops = BigInt(item.amount ?? "0");
      return total + amountDrops;
    }, 0n);
    if (totalXrpDrops > availableDrops && totalXrpDrops > 0n) {
      const scaledItems: Array<Record<string, any>> = [];
      for (const item of distributionItems) {
        if (item.token || item.type === "NFT") {
          scaledItems.push(item);
          continue;
        }
        const amountDrops = BigInt(item.amount ?? "0");
        const adjustedDrops = (amountDrops * availableDrops) / totalXrpDrops;
        if (adjustedDrops <= 0n) {
          continue;
        }
        scaledItems.push({ ...item, amount: adjustedDrops.toString() });
      }
      distributionItems.length = 0;
      distributionItems.push(...scaledItems);
    }

    const existingItemsSnap = await itemsRef.get();
    if (!existingItemsSnap.empty) {
      await Promise.all(existingItemsSnap.docs.map((doc) => doc.ref.delete()));
    }

    await stateRef.set(
      {
        status: "RUNNING",
        totalCount: distributionItems.length,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        escalationCount: 0,
        retryLimit: 3,
        startedAt: now,
        updatedAt: now
      },
      { merge: true }
    );

    let successCount = 0;
    let failedCount = 0;
    for (const item of distributionItems) {
      const itemRef = itemsRef.doc();
      const token = item.token ?? null;
      try {
        if (item.type === "NFT") {
          const result = await createNftSellOffer({
            sellerSeed: lockSeed,
            sellerAddress: lockWalletAddress,
            tokenId: String(item.tokenId ?? ""),
            destinationAddress: String(item.heirAddress ?? ""),
            amountDrops: "0"
          });
          await itemRef.set(
            {
              ...item,
              status: "VERIFIED",
              offerId: result.offerId ?? null,
              txHash: result.txHash ?? null,
              updatedAt: now
            },
            { merge: true }
          );
        } else if (token) {
          const result = await sendTokenPayment({
            fromSeed: lockSeed,
            fromAddress: lockWalletAddress,
            to: item.heirAddress,
            token,
            amount: item.amount
          });
          await itemRef.set(
            { ...item, status: "VERIFIED", txHash: result.txHash ?? null, updatedAt: now },
            { merge: true }
          );
        } else {
          const result = await sendXrpPayment({
            fromSeed: lockSeed,
            fromAddress: lockWalletAddress,
            to: item.heirAddress,
            amountDrops: item.amount
          });
          await itemRef.set(
            { ...item, status: "VERIFIED", txHash: result.txHash ?? null, updatedAt: now },
            { merge: true }
          );
        }
        successCount += 1;
      } catch (error: any) {
        failedCount += 1;
        await itemRef.set(
          {
            ...item,
            status: "FAILED",
            attempts: 1,
            error: error?.message ?? "送金に失敗しました",
            updatedAt: now
          },
          { merge: true }
        );
      }
    }

    const status = failedCount > 0 ? "PARTIAL" : "COMPLETED";
    const updatedAt = c.get("deps").now();
    await stateRef.set(
      {
        status,
        successCount,
        failedCount,
        updatedAt
      },
      { merge: true }
    );
    if (status === "COMPLETED") {
      await caseRef.set({ stage: "COMPLETED", updatedAt }, { merge: true });
    }

    return jsonOk(c, {
      status,
      totalCount: distributionItems.length,
      successCount,
      failedCount,
      skippedCount: 0,
      escalationCount: 0,
      startedAt: now,
      updatedAt
    });
  });

  app.post(":caseId/signer-list/sign", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const signedBlob =
      typeof body?.signedBlob === "string" ? body.signedBlob.trim() : "";
    if (!signedBlob) {
      return jsonError(c, 400, "VALIDATION_ERROR", "signedBlobは必須です");
    }

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
      return jsonError(c, 400, "NOT_READY", "相続実行が開始されていません");
    }

    const signerRef = caseRef.collection("signerList").doc("state");
    const signerSnap = await signerRef.get();
    if (!signerSnap.exists || signerSnap.data()?.status !== "SET") {
      return jsonError(c, 400, "SIGNER_LIST_NOT_READY", "署名準備が完了していません");
    }

    const walletSnap = await caseRef.collection("heirWallets").doc(auth.uid).get();
    const wallet = walletSnap.data() ?? {};
    const address = typeof wallet.address === "string" ? wallet.address : "";
    const isVerified = wallet.verificationStatus === "VERIFIED";
    if (!address || !isVerified) {
      return jsonError(c, 400, "WALLET_NOT_VERIFIED", "ウォレットが未確認です");
    }

    const approvalSnap = await caseRef.collection("signerList").doc("approvalTx").get();
    if (!approvalSnap.exists) {
      return jsonError(c, 400, "APPROVAL_TX_NOT_READY", "署名対象が未生成です");
    }
    const approvalData = approvalSnap.data() ?? {};
    const decoded: any = decodeSignedBlob(signedBlob);
    const signers = Array.isArray(decoded?.Signers) ? decoded.Signers : [];
    const hasSigner = signers.some((entry: any) => entry?.Signer?.Account === address);
    if (!hasSigner) {
      return jsonError(c, 400, "SIGNER_MISMATCH", "署名者が一致しません");
    }
    const memoHex = Buffer.from(String(approvalData.memo ?? ""), "utf8")
      .toString("hex")
      .toUpperCase();
    const memoValue = decoded?.Memos?.[0]?.Memo?.MemoData ?? "";
    if (memoHex && memoValue !== memoHex) {
      return jsonError(c, 400, "MEMO_MISMATCH", "署名対象が一致しません");
    }

    const now = c.get("deps").now();
    await signerRef.collection("signatures").doc(auth.uid).set({
      uid: auth.uid,
      address,
      signedBlob,
      createdAt: now
    });

    const signaturesSnap = await signerRef.collection("signatures").get();
    const signaturesCount = signaturesSnap.docs.length;
    const heirCount = Math.max(0, memberUids.length - 1);
    const requiredCount = Math.max(1, Math.floor(heirCount / 2) + 1);

    if (
      signaturesCount >= requiredCount &&
      approvalData?.systemSignedBlob &&
      approvalData?.status === "PREPARED"
    ) {
      const blobs = [
        approvalData.systemSignedBlob,
        ...signaturesSnap.docs.map((doc) => doc.data()?.signedBlob).filter(Boolean)
      ];
      const combined = combineMultisignedBlobs(blobs);
      const submitResult = await submitMultisignedTx(combined.txJson);
      await approvalSnap.ref.set(
        {
          status: "SUBMITTED",
          submittedTxHash: submitResult.txHash ?? null,
          updatedAt: now
        },
        { merge: true }
      );
    }

    return jsonOk(c, { signaturesCount, requiredCount, signedByMe: true });
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
      reserveNfts: [],
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
        const nfts = Array.isArray(summary.nfts)
          ? summary.nfts.map((nft: any) => ({
              tokenId: String(nft.tokenId ?? ""),
              issuer: typeof nft.issuer === "string" ? nft.issuer : null,
              uri: typeof nft.uri === "string" ? nft.uri : null
            }))
          : [];
        return {
          status: "ok",
          balanceXrp: typeof summary.balanceXrp === "string" ? summary.balanceXrp : "0",
          ledgerIndex: summary.ledgerIndex ?? null,
          tokens,
          nfts,
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
          const nfts = await fetchXrplAccountNfts(address);
          if (nfts.status === "ok") {
            xrpl = { ...xrpl, tokens: lines.tokens, nfts: nfts.nfts };
          } else {
            xrpl = { status: "error", message: nfts.message };
          }
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
              nfts: xrpl.nfts ?? [],
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
      reserveNfts: Array.isArray(assetData.reserveNfts) ? assetData.reserveNfts : [],
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

  app.patch(":caseId/assets/:assetId", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const assetId = c.req.param("assetId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = assetLabelUpdateSchema.safeParse({
      label: body?.label
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
        label: parsed.data.label,
        updatedAt: deps.now()
      },
      { merge: true }
    );
    await appendAssetHistory(assetRef, {
      type: "ASSET_UPDATED",
      title: "資産名を更新しました",
      detail: parsed.data.label,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null
    });
    return jsonOk(c, { assetId, label: parsed.data.label });
  });

  app.patch(":caseId/assets/:assetId/reserve", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const assetId = c.req.param("assetId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = assetReserveSchema.safeParse({
      reserveXrp: body?.reserveXrp,
      reserveTokens: body?.reserveTokens ?? [],
      reserveNfts: body?.reserveNfts ?? []
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
        reserveNfts: parsed.data.reserveNfts,
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

  app.post(":caseId/asset-lock/start", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    if (body?.method !== "B") {
      return jsonError(c, 400, "VALIDATION_ERROR", "方式Bのみ利用できます");
    }
    const method = "B" as const;

    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Case not found");
    }
    const caseData = caseSnap.data() ?? {};
    if (caseData.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const plansSnap = await caseRef.collection("plans").get();
    const plans = plansSnap.docs.map((doc) => doc.data() ?? {});
    if (plans.length === 0) {
      return jsonError(c, 400, "NOT_READY", "相続対象の指図がありません");
    }
    const hasMissingHeirs = plans.some((plan) => {
      const heirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
      return heirUids.length === 0;
    });
    if (hasMissingHeirs) {
      return jsonError(c, 400, "NOT_READY", "相続人が未設定の指図があります");
    }

    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    const heirUids = memberUids.filter((uid) => uid !== caseData.ownerUid);
    if (caseData.stage === "IN_PROGRESS") {
      const walletSnaps = await Promise.all(
        heirUids.map((uid) => db.collection(`cases/${caseId}/heirWallets`).doc(uid).get())
      );
      const heirWallets = walletSnaps.map((snap) => {
        const data = snap.data() ?? {};
        const address = typeof data.address === "string" ? data.address : "";
        const verified = data.verificationStatus === "VERIFIED" && address.length > 0;
        return { address, verified };
      });
      const hasUnverified = heirWallets.some((wallet) => !wallet.verified);
      if (hasUnverified) {
        return jsonError(c, 400, "WALLET_NOT_VERIFIED", "相続人ウォレットが未検証です");
      }
    }

    const assetsSnap = await db.collection(`cases/${caseId}/assets`).get();
    const itemsSnap = await caseRef.collection("assetLockItems").get();
    if (!itemsSnap.empty) {
      await Promise.all(itemsSnap.docs.map((doc) => doc.ref.delete()));
    }
    let wallet: { address: string; seed: string };
    try {
      wallet = await createXrplWallet();
    } catch (error: any) {
      return jsonError(
        c,
        500,
        "XRPL_ERROR",
        error?.message ?? "XRPL wallet propose failed"
      );
    }
    const now = deps.now();
    const walletActivation = await resolveAssetLockWalletActivation(wallet.address, now);
    const uiStep = 3;
    const methodStep = "REGULAR_KEY_SET";
    const items = await createAssetLockItemsFromAssets(
      caseRef,
      assetsSnap.docs.map((doc) => ({
        assetId: doc.id,
        asset: doc.data() ?? {}
      })),
      now
    );
    if (items.length === 0) {
      return jsonError(
        c,
        400,
        "NOT_READY",
        "ロック対象の資産がありません。資産を追加してから再実行してください。"
      );
    }
    await caseRef.collection("assetLock").doc("state").set({
      status: "READY",
      method,
      uiStep,
      methodStep,
      wallet: {
        address: wallet.address,
        seedEncrypted: encryptPayload(wallet.seed),
        createdAt: now,
        ...walletActivation
      },
      createdAt: now,
      updatedAt: now
    });

    if (caseData.stage === "IN_PROGRESS") {
      const systemSigner = process.env.XRPL_SYSTEM_SIGNER_ADDRESS ?? "";
      if (!systemSigner) {
        return jsonError(c, 500, "SYSTEM_SIGNER_MISSING", "システム署名者が未設定です");
      }
      const walletSnaps = await Promise.all(
        heirUids.map((uid) => db.collection(`cases/${caseId}/heirWallets`).doc(uid).get())
      );
      const heirAddresses = walletSnaps
        .map((snap) => (typeof snap.data()?.address === "string" ? snap.data()?.address : ""))
        .filter((address) => address);
      const quorum = heirAddresses.length + (Math.floor(heirAddresses.length / 2) + 1);
      const signerEntries = [
        { account: systemSigner, weight: heirAddresses.length },
        ...heirAddresses.map((address) => ({ account: address, weight: 1 }))
      ];
      try {
        await sendSignerListSet({
          fromSeed: wallet.seed,
          fromAddress: wallet.address,
          signerEntries,
          quorum
        });
        await caseRef.collection("signerList").doc("state").set({
          status: "SET",
          quorum,
          entries: signerEntries,
          createdAt: now,
          updatedAt: now
        });
      } catch (error: any) {
        await caseRef.collection("signerList").doc("state").set({
          status: "FAILED",
          quorum,
          entries: signerEntries,
          error: error?.message ?? "SignerListSet failed",
          createdAt: now,
          updatedAt: now
        });
        return jsonError(c, 500, "SIGNER_LIST_FAILED", "SignerListSetに失敗しました");
      }
    }

    return jsonOk(c, {
      status: "READY",
      method,
      uiStep,
      methodStep,
      wallet: buildAssetLockWalletResponse({
        address: wallet.address,
        ...walletActivation
      }),
      items,
      regularKeyStatuses: []
    });
  });

  app.post(":caseId/asset-lock/verify", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const itemId = body?.itemId;
    const txHash = body?.txHash;
    if (typeof itemId !== "string" || itemId.trim().length === 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "itemIdは必須です");
    }
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

    const lockSnap = await caseRef.collection("assetLock").doc("state").get();
    const lockData = lockSnap.data() ?? {};
    const caseLocked = caseSnap.data()?.assetLockStatus === "LOCKED";
    const destination = lockData?.wallet?.address;
    if (!destination) {
      return jsonError(c, 400, "VALIDATION_ERROR", "送金先ウォレットが未設定です");
    }

    const itemRef = caseRef.collection("assetLockItems").doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Item not found");
    }
    const item = itemSnap.data() ?? {};

    const result = await fetchXrplTx(txHash);
    if (!result.ok) {
      return jsonError(c, 400, "XRPL_TX_NOT_FOUND", result.message);
    }
    const tx = result.tx as any;
    const from = tx?.Account;
    const to = tx?.Destination;

    if (to !== destination) {
      await itemRef.set({ status: "FAILED", error: "DESTINATION_MISMATCH", txHash }, { merge: true });
      return jsonError(c, 400, "DESTINATION_MISMATCH", "送金先が一致しません");
    }
    if (item.assetAddress && from !== item.assetAddress) {
      await itemRef.set({ status: "FAILED", error: "FROM_MISMATCH", txHash }, { merge: true });
      return jsonError(c, 400, "FROM_MISMATCH", "送信元が一致しません");
    }

    if (item.token) {
      const amount = tx?.Amount ?? {};
      const amountCurrency = amount?.currency;
      const amountIssuer = amount?.issuer;
      const amountValue = String(amount?.value ?? "");
      if (amountCurrency !== item.token.currency || amountIssuer !== item.token.issuer) {
        await itemRef.set(
          { status: "FAILED", error: "TOKEN_MISMATCH", txHash },
          { merge: true }
        );
        return jsonError(c, 400, "TOKEN_MISMATCH", "トークン情報が一致しません");
      }
      if (amountValue !== String(item.plannedAmount)) {
        await itemRef.set(
          { status: "FAILED", error: "AMOUNT_MISMATCH", txHash },
          { merge: true }
        );
        return jsonError(c, 400, "AMOUNT_MISMATCH", "送金額が一致しません");
      }
    } else {
      const amount = String(tx?.Amount ?? "");
      if (amount !== String(item.plannedAmount)) {
        await itemRef.set(
          { status: "FAILED", error: "AMOUNT_MISMATCH", txHash },
          { merge: true }
        );
        return jsonError(c, 400, "AMOUNT_MISMATCH", "送金額が一致しません");
      }
    }

    await itemRef.set({ status: "VERIFIED", txHash, error: null }, { merge: true });

    const itemsSnap = await caseRef.collection("assetLockItems").get();
    const items = itemsSnap.docs.map((doc) => {
      const item = doc.data() ?? {};
      return {
        itemId: item.itemId ?? doc.id,
        assetId: item.assetId ?? "",
        assetLabel: item.assetLabel ?? "",
        token: item.token ?? null,
        plannedAmount: item.plannedAmount ?? "0",
        status: item.status ?? "PENDING",
        txHash: item.txHash ?? null,
        error: item.error ?? null
      };
    });

    return jsonOk(c, {
      status: lockData.status ?? "READY",
      method: lockData.method ?? null,
      uiStep: typeof lockData.uiStep === "number" ? lockData.uiStep : null,
      methodStep: lockData.methodStep ?? null,
      wallet: buildAssetLockWalletResponse(lockData.wallet),
      items,
      regularKeyStatuses: Array.isArray(lockData.regularKeyStatuses)
        ? lockData.regularKeyStatuses
        : []
    });
  });

  app.get(":caseId/asset-lock", async (c) => {
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

    const lockRef = caseRef.collection("assetLock").doc("state");
    const lockSnap = await lockRef.get();
    const lockData = lockSnap.data() ?? {};
    const lockWallet = buildAssetLockWalletResponse(lockData.wallet);
    let wallet = lockWallet;
    if (lockWallet) {
      const activation = await resolveAssetLockWalletActivation(
        lockWallet.address,
        c.get("deps").now()
      );
      wallet = {
        ...lockWallet,
        ...activation
      };
      await lockRef.set(
        {
          wallet: {
            ...(lockData.wallet ?? {}),
            ...activation
          },
          updatedAt: c.get("deps").now()
        },
        { merge: true }
      );
    }
    const itemsSnap = await caseRef.collection("assetLockItems").get();
    const items = itemsSnap.docs.map((doc) => {
      const item = doc.data() ?? {};
      return {
        itemId: item.itemId ?? doc.id,
        assetId: item.assetId ?? "",
        assetLabel: item.assetLabel ?? "",
        token: item.token ?? null,
        plannedAmount: item.plannedAmount ?? "0",
        status: item.status ?? "PENDING",
        txHash: item.txHash ?? null,
        error: item.error ?? null
      };
    });

    return jsonOk(c, {
      status: lockData.status ?? "DRAFT",
      method: lockData.method ?? null,
      uiStep: typeof lockData.uiStep === "number" ? lockData.uiStep : null,
      methodStep: lockData.methodStep ?? null,
      wallet,
      items,
      regularKeyStatuses: Array.isArray(lockData.regularKeyStatuses)
        ? lockData.regularKeyStatuses
        : []
    });
  });

  app.get(":caseId/asset-lock/balances", async (c) => {
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

    const lockSnap = await caseRef.collection("assetLock").doc("state").get();
    const lockData = lockSnap.data() ?? {};
    const caseLocked = caseSnap.data()?.assetLockStatus === "LOCKED";
    const destination = lockData?.wallet?.address;
    if (!destination) {
      return jsonError(c, 400, "VALIDATION_ERROR", "送金先ウォレットが未設定です");
    }

    const itemsSnap = await caseRef.collection("assetLockItems").get();
    const items = itemsSnap.docs.map((doc) => doc.data() ?? {});
    let assetIds = Array.from(
      new Set(
        items
          .map((item) => String(item.assetId ?? ""))
          .filter((assetId) => assetId.length > 0)
      )
    );
    if (assetIds.length === 0) {
      const assetsSnap = await caseRef.collection("assets").get();
      assetIds = assetsSnap.docs.map((doc) => doc.id);
    }
    if (assetIds.length === 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "送金対象がありません");
    }

    const assetSnaps = await Promise.all(
      assetIds.map((assetId) => caseRef.collection("assets").doc(assetId).get())
    );
    const sources: Array<{
      assetId: string;
      assetLabel: string;
      address: string;
      status: "ok" | "error";
      balanceXrp: string | null;
      message: string | null;
    }> = [];
    for (const assetSnap of assetSnaps) {
      if (!assetSnap.exists) {
        sources.push({
          assetId: assetSnap.id,
          assetLabel: "",
          address: "",
          status: "error",
          balanceXrp: null,
          message: "Asset not found"
        });
        continue;
      }
      const assetData = assetSnap.data() ?? {};
      const assetLabel = typeof assetData.label === "string" ? assetData.label : "";
      const addressFromItem =
        items.find((item) => String(item.assetId ?? "") === assetSnap.id)?.assetAddress ?? "";
      const address =
        typeof addressFromItem === "string" && addressFromItem.length > 0
          ? addressFromItem
          : typeof assetData.address === "string"
            ? assetData.address
            : "";
      if (!address) {
        sources.push({
          assetId: assetSnap.id,
          assetLabel,
          address: "",
          status: "error",
          balanceXrp: null,
          message: "アドレスがありません"
        });
        continue;
      }
      const info = await fetchXrplAccountInfo(address);
      if (info.status !== "ok") {
        sources.push({
          assetId: assetSnap.id,
          assetLabel,
          address,
          status: "error",
          balanceXrp: null,
          message: info.message
        });
        continue;
      }
      sources.push({
        assetId: assetSnap.id,
        assetLabel,
        address,
        status: "ok",
        balanceXrp: info.balanceXrp,
        message: null
      });
    }

    const destinationInfo = await fetchXrplAccountInfo(destination);
    const destinationAccountNotFound =
      destinationInfo.status !== "ok" && /account not found/i.test(destinationInfo.message ?? "");
    const destinationFinalized =
      lockData.status === "LOCKED" ||
      caseLocked ||
      lockData.methodStep === "REGULAR_KEY_CLEARED";
    const destinationStatus =
      destinationInfo.status === "ok"
        ? {
            status: "ok" as const,
            balanceXrp: destinationInfo.balanceXrp,
            message: null
          }
        : destinationFinalized && destinationAccountNotFound
          ? {
              status: "ok" as const,
              balanceXrp: "0",
              message: null
            }
        : {
            status: "error" as const,
            balanceXrp: null,
            message: destinationInfo.message
          };

    return jsonOk(c, {
      destination: {
        address: destination,
        ...destinationStatus
      },
      sources
    });
  });

  app.post(":caseId/asset-lock/complete", async (c) => {
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

    const itemsSnap = await caseRef.collection("assetLockItems").get();
    const itemsDocs = itemsSnap.docs;
    if (
      itemsDocs.length === 0 ||
      itemsDocs.some((doc) => (doc.data()?.status ?? "PENDING") !== "VERIFIED")
    ) {
      return jsonError(c, 400, "VALIDATION_ERROR", "送金確認が完了していません");
    }

    const lockRef = caseRef.collection("assetLock").doc("state");
    await lockRef.set(
      { status: "LOCKED", uiStep: 4, updatedAt: c.get("deps").now() },
      { merge: true }
    );
    await caseRef.set({ assetLockStatus: "LOCKED", stage: "WAITING" }, { merge: true });

    const lockSnap = await lockRef.get();
    const lockData = lockSnap.data() ?? {};
    const items = itemsDocs.map((doc) => {
      const item = doc.data() ?? {};
      return {
        itemId: item.itemId ?? doc.id,
        assetId: item.assetId ?? "",
        assetLabel: item.assetLabel ?? "",
        token: item.token ?? null,
        plannedAmount: item.plannedAmount ?? "0",
        status: item.status ?? "PENDING",
        txHash: item.txHash ?? null,
        error: item.error ?? null
      };
    });

    return jsonOk(c, {
      status: lockData.status ?? "LOCKED",
      method: lockData.method ?? null,
      uiStep: typeof lockData.uiStep === "number" ? lockData.uiStep : 4,
      methodStep: lockData.methodStep ?? null,
      wallet: buildAssetLockWalletResponse(lockData.wallet),
      items,
      regularKeyStatuses: Array.isArray(lockData.regularKeyStatuses)
        ? lockData.regularKeyStatuses
        : []
    });
  });

  app.patch(":caseId/asset-lock/state", async (c) => {
    const deps = c.get("deps");
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const body = await c.req.json().catch(() => ({}));
    const hasUiStep = Object.prototype.hasOwnProperty.call(body, "uiStep");
    const hasMethodStep = Object.prototype.hasOwnProperty.call(body, "methodStep");
    const methodSteps = new Set([
      "REGULAR_KEY_SET",
      "AUTO_TRANSFER",
      "TRANSFER_DONE",
      "REGULAR_KEY_CLEARED"
    ]);

    let uiStep: number | null = null;
    if (hasUiStep) {
      if (body.uiStep === null) {
        uiStep = null;
      } else if (!Number.isInteger(body.uiStep) || body.uiStep < 1 || body.uiStep > 4) {
        return jsonError(c, 400, "VALIDATION_ERROR", "uiStepは1〜4の整数です");
      } else {
        uiStep = body.uiStep;
      }
    }

    let methodStep: string | null = null;
    if (hasMethodStep) {
      if (body.methodStep === null) {
        methodStep = null;
      } else if (typeof body.methodStep !== "string" || !methodSteps.has(body.methodStep)) {
        return jsonError(c, 400, "VALIDATION_ERROR", "methodStepが不正です");
      } else {
        methodStep = body.methodStep;
      }
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

    const lockRef = caseRef.collection("assetLock").doc("state");
    const lockSnap = await lockRef.get();
    const lockData = lockSnap.data() ?? {};
    if (hasMethodStep && methodStep === "AUTO_TRANSFER" && lockData.method === "B") {
      const statuses = Array.isArray(lockData.regularKeyStatuses)
        ? lockData.regularKeyStatuses
        : [];
      const allVerified =
        statuses.length > 0 &&
        statuses.every((status) => status?.status === "VERIFIED");
      if (!allVerified) {
        return jsonError(c, 400, "REGULAR_KEY_UNVERIFIED", "RegularKeyの確認が必要です");
      }
    }
    const now = deps.now();
    const updateData: Record<string, any> = {
      updatedAt: now
    };
    if (!lockSnap.exists) {
      updateData.status = "DRAFT";
      updateData.method = null;
      updateData.createdAt = now;
    }
    if (hasUiStep) {
      updateData.uiStep = uiStep;
    }
    if (hasMethodStep) {
      updateData.methodStep = methodStep;
    }
    await lockRef.set(updateData, { merge: true });

    const latestSnap = await lockRef.get();
    const latest = latestSnap.data() ?? {};
    const itemsSnap = await caseRef.collection("assetLockItems").get();
    const items = itemsSnap.docs.map((doc) => {
      const item = doc.data() ?? {};
      return {
        itemId: item.itemId ?? doc.id,
        assetId: item.assetId ?? "",
        assetLabel: item.assetLabel ?? "",
        token: item.token ?? null,
        plannedAmount: item.plannedAmount ?? "0",
        status: item.status ?? "PENDING",
        txHash: item.txHash ?? null,
        error: item.error ?? null
      };
    });

    return jsonOk(c, {
      status: latest.status ?? "DRAFT",
      method: latest.method ?? null,
      uiStep: typeof latest.uiStep === "number" ? latest.uiStep : null,
      methodStep: latest.methodStep ?? null,
      wallet: buildAssetLockWalletResponse(latest.wallet),
      items,
      regularKeyStatuses: Array.isArray(latest.regularKeyStatuses)
        ? latest.regularKeyStatuses
        : []
    });
  });

  app.post(":caseId/asset-lock/regular-key/verify", async (c) => {
    const deps = c.get("deps");
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

    const lockRef = caseRef.collection("assetLock").doc("state");
    const lockSnap = await lockRef.get();
    const lockData = lockSnap.data() ?? {};
    if (lockData.method !== "B") {
      return jsonError(c, 400, "VALIDATION_ERROR", "B方式のみ実行できます");
    }
    const destination = lockData?.wallet?.address;
    if (!destination) {
      return jsonError(c, 400, "VALIDATION_ERROR", "送金先ウォレットが未設定です");
    }

    const itemsSnap = await caseRef.collection("assetLockItems").get();
    let assetIds = Array.from(
      new Set(
        itemsSnap.docs
          .map((doc) => doc.data()?.assetId)
          .filter((assetId) => typeof assetId === "string" && assetId.length > 0)
      )
    );
    if (assetIds.length === 0) {
      const assetsSnap = await caseRef.collection("assets").get();
      assetIds = assetsSnap.docs.map((doc) => doc.id);
    }
    if (assetIds.length === 0) {
      return jsonError(c, 400, "VALIDATION_ERROR", "送金対象がありません");
    }

    const assetSnaps = await Promise.all(
      assetIds.map((assetId) => caseRef.collection("assets").doc(assetId).get())
    );
    const statuses = [];
    for (const assetSnap of assetSnaps) {
      if (!assetSnap.exists) {
        statuses.push({
          assetId: assetSnap.id,
          assetLabel: "",
          address: "",
          status: "ERROR",
          message: "Asset not found"
        });
        continue;
      }
      const assetData = assetSnap.data() ?? {};
      const address = typeof assetData.address === "string" ? assetData.address : "";
      const assetLabel = typeof assetData.label === "string" ? assetData.label : "";
      if (!address) {
        statuses.push({
          assetId: assetSnap.id,
          assetLabel,
          address: "",
          status: "UNVERIFIED",
          message: "アドレスがありません"
        });
        continue;
      }
      const info = await fetchXrplAccountInfo(address);
      if (info.status !== "ok") {
        statuses.push({
          assetId: assetSnap.id,
          assetLabel,
          address,
          status: "ERROR",
          message: info.message
        });
        continue;
      }
      if (info.regularKey !== destination) {
        statuses.push({
          assetId: assetSnap.id,
          assetLabel,
          address,
          status: "UNVERIFIED",
          message: "RegularKeyが一致しません"
        });
        continue;
      }
      statuses.push({
        assetId: assetSnap.id,
        assetLabel,
        address,
        status: "VERIFIED",
        message: null
      });
    }

    const allVerified = statuses.every((status) => status.status === "VERIFIED");
    const now = deps.now();
    await lockRef.set(
      {
        regularKeyStatuses: statuses,
        regularKeyCheckedAt: now,
        methodStep: allVerified ? "AUTO_TRANSFER" : "REGULAR_KEY_SET",
        updatedAt: now
      },
      { merge: true }
    );

    const latestSnap = await lockRef.get();
    const latest = latestSnap.data() ?? {};
    const items = itemsSnap.docs.map((doc) => {
      const item = doc.data() ?? {};
      return {
        itemId: item.itemId ?? doc.id,
        assetId: item.assetId ?? "",
        assetLabel: item.assetLabel ?? "",
        token: item.token ?? null,
        plannedAmount: item.plannedAmount ?? "0",
        status: item.status ?? "PENDING",
        txHash: item.txHash ?? null,
        error: item.error ?? null
      };
    });

    return jsonOk(c, {
      status: latest.status ?? "DRAFT",
      method: latest.method ?? null,
      uiStep: typeof latest.uiStep === "number" ? latest.uiStep : null,
      methodStep: latest.methodStep ?? null,
      wallet: buildAssetLockWalletResponse(latest.wallet),
      items,
      regularKeyStatuses: Array.isArray(latest.regularKeyStatuses)
        ? latest.regularKeyStatuses
        : []
    });
  });

  app.post(":caseId/asset-lock/execute", async (c) => {
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

    const lockSnap = await caseRef.collection("assetLock").doc("state").get();
    const lockData = lockSnap.data() ?? {};
    if (lockData.method !== "B") {
      return jsonError(c, 400, "VALIDATION_ERROR", "B方式のみ実行できます");
    }
    const statuses = Array.isArray(lockData.regularKeyStatuses)
      ? lockData.regularKeyStatuses
      : [];
    const allVerified =
      statuses.length > 0 && statuses.every((status) => status?.status === "VERIFIED");
    if (!allVerified) {
      return jsonError(c, 400, "REGULAR_KEY_UNVERIFIED", "RegularKeyの確認が必要です");
    }
    const destination = lockData?.wallet?.address;
    const seedEncrypted = lockData?.wallet?.seedEncrypted;
    if (!destination || !seedEncrypted) {
      return jsonError(c, 400, "VALIDATION_ERROR", "送金先ウォレットが未設定です");
    }

    const seed = decryptPayload(seedEncrypted);
    const signingAddress = getWalletAddressFromSeed(seed);
    if (signingAddress !== destination) {
      return jsonError(
        c,
        400,
        "REGULAR_KEY_SEED_MISMATCH",
        "分配用Walletの鍵が一致しません"
      );
    }
    const regularKeySourceAddresses = Array.from(
      new Set(
        (Array.isArray(lockData.regularKeyStatuses) ? lockData.regularKeyStatuses : [])
          .map((status) => (typeof status?.address === "string" ? status.address : ""))
          .filter((address) => address.length > 0)
      )
    );
    const clearRegularKeys = async () => {
      for (const fromAddress of regularKeySourceAddresses) {
        try {
          await clearRegularKey({ fromSeed: seed, fromAddress });
        } catch (error: any) {
          return jsonError(
            c,
            400,
            "REGULAR_KEY_CLEAR_FAILED",
            error?.message ?? "RegularKeyの解除に失敗しました"
          );
        }
      }
      return null;
    };
    const itemsSnap = await caseRef.collection("assetLockItems").get();
    let itemEntries = itemsSnap.docs.map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data() ?? {}
    }));
    if (itemEntries.length === 0) {
      const assetsSnap = await caseRef.collection("assets").get();
      const rebuiltItems = await createAssetLockItemsFromAssets(
        caseRef,
        assetsSnap.docs.map((doc) => ({
          assetId: doc.id,
          asset: doc.data() ?? {}
        })),
        c.get("deps").now()
      );
      if (rebuiltItems.length > 0) {
        const rebuiltItemsSnap = await caseRef.collection("assetLockItems").get();
        itemEntries = rebuiltItemsSnap.docs.map((doc) => ({
          id: doc.id,
          ref: doc.ref,
          data: doc.data() ?? {}
        }));
      }
    }
    const finalizeExecution = async () => {
      const clearError = await clearRegularKeys();
      if (clearError) {
        return clearError;
      }
      await caseRef
        .collection("assetLock")
        .doc("state")
        .set({ methodStep: "TRANSFER_DONE", updatedAt: c.get("deps").now() }, { merge: true });
      await caseRef
        .collection("assetLock")
        .doc("state")
        .set(
          {
            status: "LOCKED",
            methodStep: "REGULAR_KEY_CLEARED",
            uiStep: 4,
            updatedAt: c.get("deps").now()
          },
          { merge: true }
        );
      await caseRef.set({ assetLockStatus: "LOCKED", stage: "WAITING" }, { merge: true });

      const finalLockSnap = await caseRef.collection("assetLock").doc("state").get();
      const finalLockData = finalLockSnap.data() ?? {};
      const finalItemsSnap = await caseRef.collection("assetLockItems").get();
      const items = finalItemsSnap.docs.map((doc) => {
        const item = doc.data() ?? {};
        return {
          itemId: item.itemId ?? doc.id,
          assetId: item.assetId ?? "",
          assetLabel: item.assetLabel ?? "",
          token: item.token ?? null,
          plannedAmount: item.plannedAmount ?? "0",
          status: item.status ?? "PENDING",
          txHash: item.txHash ?? null,
          error: item.error ?? null
        };
      });
      return jsonOk(c, {
        status: finalLockData.status ?? "READY",
        method: finalLockData.method ?? null,
        uiStep: typeof finalLockData.uiStep === "number" ? finalLockData.uiStep : null,
        methodStep: finalLockData.methodStep ?? null,
        wallet: buildAssetLockWalletResponse(finalLockData.wallet),
        items,
        regularKeyStatuses: Array.isArray(finalLockData.regularKeyStatuses)
          ? finalLockData.regularKeyStatuses
          : []
      });
    };
    const assetIds = Array.from(
      new Set(
        itemEntries
          .map((entry) => String(entry.data?.assetId ?? ""))
          .filter((assetId) => assetId.length > 0)
      )
    );
    if (itemEntries.length === 0) {
      return jsonError(
        c,
        400,
        "ASSET_LOCK_ITEMS_EMPTY",
        "ロック対象の資産がありません。資産を追加してから再実行してください。"
      );
    }
    const assetSnaps = await Promise.all(
      assetIds.map((assetId) => caseRef.collection("assets").doc(assetId).get())
    );
    const assetMap = new Map<
      string,
      { address: string; reserveXrp: string; label: string }
    >();
    for (const assetSnap of assetSnaps) {
      if (!assetSnap.exists) {
        return jsonError(c, 404, "NOT_FOUND", "Asset not found");
      }
      const assetData = assetSnap.data() ?? {};
      const address = typeof assetData.address === "string" ? assetData.address : "";
      const reserveXrp = String(assetData.reserveXrp ?? "0");
      const label = typeof assetData.label === "string" ? assetData.label : "";
      if (!address) {
        return jsonError(c, 400, "VALIDATION_ERROR", "資産ウォレットのアドレスが取得できません");
      }
      assetMap.set(assetSnap.id, { address, reserveXrp, label });
    }

    const feePerTxDrops = 12n;
    const reserveInfo = await fetchXrplReserve();
    const reserveBaseDrops =
      reserveInfo.status === "ok"
        ? BigInt(reserveInfo.reserveBaseDrops)
        : BigInt(toDrops(process.env.XRPL_RESERVE_BASE_XRP ?? "10"));
    const reserveIncDrops =
      reserveInfo.status === "ok"
        ? BigInt(reserveInfo.reserveIncDrops)
        : BigInt(toDrops(process.env.XRPL_RESERVE_INC_XRP ?? "2"));
    const plannedOverrides = new Map<string, string>();
    const availableDropsByAsset = new Map<string, bigint>();
    for (const assetId of assetIds) {
      const asset = assetMap.get(assetId);
      if (!asset) continue;
      const itemsForAsset = itemEntries.filter(
        (entry) => String(entry.data?.assetId ?? "") === assetId
      );
      const txCount = BigInt(itemsForAsset.length);
      const info = await fetchXrplAccountInfo(asset.address);
      if (info.status !== "ok") {
        return jsonError(c, 400, "XRPL_ACCOUNT_INFO_FAILED", info.message);
      }
      const balanceDrops = BigInt(toDrops(info.balanceXrp));
      const ownerCount =
        typeof info.ownerCount === "number" && Number.isFinite(info.ownerCount)
          ? info.ownerCount
          : 0;
      const requiredReserveDrops = reserveBaseDrops + reserveIncDrops * BigInt(ownerCount);
      const reserveDrops = BigInt(toDrops(asset.reserveXrp));
      const totalReserveDrops = requiredReserveDrops + reserveDrops;
      const feeDrops = txCount * feePerTxDrops;
      const availableDrops = balanceDrops - totalReserveDrops - feeDrops;
      availableDropsByAsset.set(assetId, availableDrops);
      if (availableDrops <= 0n) {
        const labelSuffix = asset.label ? `「${asset.label}」` : "";
        return jsonError(
          c,
          400,
          "INSUFFICIENT_BALANCE",
          `資産ウォレット${labelSuffix}の残高が不足しています。資産ウォレットにXRPを追加してください。`
        );
      }
      const xrpEntry = itemsForAsset.find((entry) => !entry.data?.token);
      if (xrpEntry) {
        const plannedDrops = toBigInt(xrpEntry.data?.plannedAmount);
        const adjustedDrops = plannedDrops > availableDrops ? availableDrops : plannedDrops;
        if (adjustedDrops !== plannedDrops) {
          plannedOverrides.set(xrpEntry.id, adjustedDrops.toString());
        }
      }
    }

    for (const entry of itemEntries) {
      const override = plannedOverrides.get(entry.id);
      if (override) {
        entry.data.plannedAmount = override;
        await entry.ref.set({ plannedAmount: override }, { merge: true });
      }
    }

    const prefundedTxHashByItemId = new Map<string, string | null>();
    const initialDestinationActivation = await resolveAssetLockWalletActivation(
      destination,
      c.get("deps").now()
    );
    if (initialDestinationActivation.activationStatus === "PENDING") {
      const prefundDrops = reserveBaseDrops;
      const xrpEntries = itemEntries.filter((entry) => !entry.data?.token);
      const plannedXrpByAsset = new Map<string, bigint>();
      for (const entry of xrpEntries) {
        const assetId = String(entry.data?.assetId ?? "");
        if (!assetId) continue;
        const plannedDrops = toBigInt(plannedOverrides.get(entry.id) ?? entry.data?.plannedAmount ?? "0");
        plannedXrpByAsset.set(assetId, (plannedXrpByAsset.get(assetId) ?? 0n) + plannedDrops);
      }

      let prefundTarget:
        | {
            entryId: string;
            entryRef: any;
            fromAddress: string;
            remainingDrops: bigint;
          }
        | null = null;
      for (const entry of xrpEntries) {
        const item = entry.data ?? {};
        const assetId = String(item.assetId ?? "");
        const asset = assetId ? assetMap.get(assetId) : null;
        const fromAddress =
          typeof item.assetAddress === "string" && item.assetAddress.length > 0
            ? item.assetAddress
            : asset?.address ?? "";
        if (!fromAddress) continue;
        const plannedDrops = toBigInt(plannedOverrides.get(entry.id) ?? item.plannedAmount ?? "0");
        if (plannedDrops <= 0n) continue;
        const availableDrops = assetId ? availableDropsByAsset.get(assetId) : undefined;
        const plannedByAsset = assetId ? plannedXrpByAsset.get(assetId) ?? 0n : plannedDrops;
        const spareDrops =
          availableDrops !== undefined && availableDrops > plannedByAsset
            ? availableDrops - plannedByAsset
            : 0n;
        const feeShortageDrops = spareDrops >= feePerTxDrops ? 0n : feePerTxDrops - spareDrops;
        const requiredDrops = prefundDrops + feeShortageDrops;
        if (plannedDrops < requiredDrops) continue;
        prefundTarget = {
          entryId: entry.id,
          entryRef: entry.ref,
          fromAddress,
          remainingDrops: plannedDrops - requiredDrops
        };
        break;
      }

      if (!prefundTarget) {
        return jsonError(
          c,
          400,
          "INSUFFICIENT_BALANCE",
          "相続先ウォレットの預かり金が不足しています。資産ウォレットにXRPを追加してください。"
        );
      }

      const prefundResult = await sendXrpPayment({
        fromSeed: seed,
        fromAddress: prefundTarget.fromAddress,
        to: destination,
        amountDrops: prefundDrops.toString()
      });
      const remainingDropsText = prefundTarget.remainingDrops.toString();
      plannedOverrides.set(prefundTarget.entryId, remainingDropsText);
      const targetEntry = itemEntries.find((entry) => entry.id === prefundTarget?.entryId);
      if (targetEntry) {
        targetEntry.data.plannedAmount = remainingDropsText;
      }
      await prefundTarget.entryRef.set({ plannedAmount: remainingDropsText }, { merge: true });
      if (prefundTarget.remainingDrops <= 0n) {
        prefundedTxHashByItemId.set(prefundTarget.entryId, prefundResult.txHash ?? null);
      }
    }

    const destinationActivation = await waitForAssetLockWalletActivation(
      destination,
      c.get("deps").now
    );
    await caseRef
      .collection("assetLock")
      .doc("state")
      .set(
        {
          wallet: {
            ...(lockData.wallet ?? {}),
            ...destinationActivation
          },
          updatedAt: c.get("deps").now()
        },
        { merge: true }
      );
    if (destinationActivation.activationStatus !== "ACTIVATED") {
      return jsonError(
        c,
        400,
        "DISTRIBUTION_WALLET_NOT_ACTIVATED",
        "分配用ウォレットがXRPL上でまだ有効化されていません。処理中の可能性があるため、数秒待ってから同意の準備を再実行してください。"
      );
    }

    await caseRef
      .collection("assetLock")
      .doc("state")
      .set({ methodStep: "AUTO_TRANSFER", updatedAt: c.get("deps").now() }, { merge: true });

    for (const entry of itemEntries) {
      const item = entry.data ?? {};
      const plannedAmount = plannedOverrides.get(entry.id) ?? item.plannedAmount ?? "";
      const assetId = typeof item.assetId === "string" ? item.assetId : "";
      const asset = assetId ? assetMap.get(assetId) : null;
      const fromAddress =
        typeof item.assetAddress === "string" && item.assetAddress.length > 0
          ? item.assetAddress
          : asset?.address ?? "";
      if (!fromAddress) {
        return jsonError(c, 400, "VALIDATION_ERROR", "送金元アドレスが取得できません");
      }
      if (item.token) {
        if (toNumber(plannedAmount) <= 0) {
          await entry.ref.set({ status: "VERIFIED", txHash: item.txHash ?? null, error: null }, { merge: true });
          continue;
        }
        const result = await sendTokenPayment({
          fromSeed: seed,
          fromAddress,
          to: destination,
          token: item.token,
          amount: String(plannedAmount)
        });
        await entry.ref.set(
          { status: "VERIFIED", txHash: result.txHash ?? null, error: null },
          { merge: true }
        );
      } else {
        const plannedDrops = toBigInt(plannedAmount);
        if (plannedDrops <= 0n) {
          await entry.ref.set(
            {
              status: "VERIFIED",
              txHash: prefundedTxHashByItemId.get(entry.id) ?? item.txHash ?? null,
              error: null
            },
            { merge: true }
          );
          continue;
        }
        const result = await sendXrpPayment({
          fromSeed: seed,
          fromAddress,
          to: destination,
          amountDrops: plannedDrops.toString()
        });
        await entry.ref.set(
          { status: "VERIFIED", txHash: result.txHash ?? null, error: null },
          { merge: true }
        );
      }
    }

    return await finalizeExecution();
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
        title: parsed.data.title
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

    const snapshot = await db.collection(`cases/${caseId}/plans`).get();
    const visiblePlanDocs = snapshot.docs.filter((doc) => {
      if (isOwner) return true;
      const heirUids = Array.isArray(doc.data()?.heirUids) ? doc.data()?.heirUids : [];
      return heirUids.includes(auth.uid);
    });
    const data = await Promise.all(
      visiblePlanDocs.map(async (doc) => {
        const plan = doc.data() as Record<string, any>;
        const { status: _status, ...rest } = plan;
        const heirUids = Array.isArray(plan.heirUids) ? plan.heirUids : [];
        const planAssetsSnap = await doc.ref.collection("assets").get();
        return {
          planId: doc.id,
          ...rest,
          heirCount: heirUids.length,
          assetCount: planAssetsSnap.docs.length
        };
      })
    );
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
    const planHeirUids = Array.isArray(planSnap.data()?.heirUids) ? planSnap.data()?.heirUids : [];
    if (!isOwner && !planHeirUids.includes(auth.uid)) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const plan = planSnap.data() ?? {};
    const { status: _status, ...rest } = plan as Record<string, unknown>;
    return jsonOk(c, {
      planId: planSnap.id,
      ...(rest as Record<string, unknown>),
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
    const planHeirUids = Array.isArray(planSnap.data()?.heirUids) ? planSnap.data()?.heirUids : [];
    if (!isOwner && !planHeirUids.includes(auth.uid)) {
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

  app.delete(":caseId/plans/:planId", async (c) => {
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

    const assetsSnap = await db
      .collection(`cases/${caseId}/plans/${planId}/assets`)
      .limit(1)
      .get();
    if ((assetsSnap.docs?.length ?? 0) > 0) {
      return jsonError(c, 400, "HAS_ASSETS", "資産が追加されているため削除できません");
    }

    await planRef.delete();
    return jsonOk(c);
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
    const planHeirUids = Array.isArray(planSnap.data()?.heirUids) ? planSnap.data()?.heirUids : [];
    if (!isOwner && !planHeirUids.includes(auth.uid)) {
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
      const reserveNfts = Array.isArray(asset.reserveNfts) ? asset.reserveNfts : [];
      const reserveSet = new Set(reserveNfts.map((id: any) => String(id)));
      const nfts = Array.isArray(asset.xrplSummary?.nfts)
        ? asset.xrplSummary.nfts.map((nft: any) => ({
            tokenId: String(nft.tokenId ?? ""),
            issuer: typeof nft.issuer === "string" ? nft.issuer : null,
            uri: typeof nft.uri === "string" ? nft.uri : null
          }))
            .filter((nft: any) => nft.tokenId && !reserveSet.has(nft.tokenId))
        : [];
      const nftAllocations = Array.isArray(planAsset.nftAllocations)
        ? planAsset.nftAllocations.filter((item: any) => {
            const tokenId = item?.tokenId;
            if (!tokenId) return true;
            return !reserveSet.has(String(tokenId));
          })
        : [];
      return {
        planAssetId: planAsset.planAssetId,
        assetId,
        assetType: "xrp-wallet",
        assetLabel: asset.label ?? "",
        assetAddress: asset.address ?? null,
        token: null,
        unitType: planAsset.unitType ?? "PERCENT",
        allocations: Array.isArray(planAsset.allocations) ? planAsset.allocations : [],
        nftAllocations,
        nfts
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

  app.post(":caseId/plans/:planId/assets/:planAssetId/nfts", async (c) => {
    const auth = c.get("auth");
    const caseId = c.req.param("caseId");
    const planId = c.req.param("planId");
    const planAssetId = c.req.param("planAssetId");
    const body = await c.req.json().catch(() => ({}));
    const parsed = planNftAllocationSchema.safeParse(body ?? {});
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

    const planRef = db.collection(`cases/${caseId}/plans`).doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Plan not found");
    }

    const planAssetRef = db.collection(`cases/${caseId}/plans/${planId}/assets`).doc(planAssetId);
    await planAssetRef.set(
      {
        nftAllocations: parsed.data.allocations,
        updatedAt: c.get("deps").now()
      },
      { merge: true }
    );
    await planRef.set({ updatedAt: c.get("deps").now() }, { merge: true });
    await appendPlanHistory(planRef, {
      type: "PLAN_NFT_ALLOCATIONS_UPDATED",
      title: "NFT割当を更新しました",
      actorUid: auth.uid,
      actorEmail: auth.email ?? null
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

  return app;
};
