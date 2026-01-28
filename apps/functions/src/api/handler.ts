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
import { DomainError, assetCreateSchema, inviteCreateSchema } from "@kototsute/shared";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import crypto from "node:crypto";

type XrplStatus =
  | { status: "ok"; balanceXrp: string; ledgerIndex?: number }
  | { status: "error"; message: string };

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

    const payload = await res.json();
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

const formatDate = (value: any): string => {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

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
  const payload = await res.json();
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

        let isExistingUserAtInvite = false;
        try {
          await getAuth().getUserByEmail(normalizedEmail);
          isExistingUserAtInvite = true;
        } catch (error: any) {
          if (error?.code !== "auth/user-not-found") {
            throw error;
          }
        }

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
            : db.collection("invites").where("email", "==", normalizeEmail(authUser.email));

        const snapshot = await query.get();
        return json(res, 200, {
          ok: true,
          data: snapshot.docs.map((doc) => {
            const data = doc.data();
            const acceptedAt = data.acceptedAt ? formatDate(data.acceptedAt) : null;
            const declinedAt = data.declinedAt ? formatDate(data.declinedAt) : null;
            return {
              inviteId: doc.id,
              ownerUid: data.ownerUid ?? "",
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
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { ok: false, code: "NOT_FOUND", message: "Not found" });
    } catch (error: any) {
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
    const decoded = await getAuth().verifyIdToken(match[1]);
    return { uid: decoded.uid, email: decoded.email ?? null };
  };

  return {
    repo,
    now: () => new Date(),
    getUid: async (req: any) => {
      const authUser = await getAuthUserFromReq(req);
      return authUser.uid;
    },
    getAuthUser: getAuthUserFromReq,
    getOwnerUidForRead: async (uid: string) => {
      const doc = await getFirestore().collection("heirs").doc(uid).get();
      if (!doc.exists) return uid;
      return (doc.data()?.ownerUid as string) ?? uid;
    }
  };
};
