import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import {
  AssetId,
  AssetIdentifier,
  ListAssetsByOwner,
  OwnerId,
  OccurredAt,
  RegisterAsset
} from "@kototsute/asset";
import { assetCreateSchema } from "@kototsute/shared";
import type { ApiBindings } from "../types.js";
import { jsonError, jsonOk } from "../utils/response.js";
import { formatDate } from "../utils/date.js";
import {
  XRPL_VERIFY_ADDRESS,
  createChallenge,
  decodeHex,
  fetchXrplAccountInfo,
  fetchXrplAccountLines,
  fetchXrplTx
} from "../utils/xrpl.js";

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
    if (!asset) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }
    if (asset.getOwnerId().toString() !== ownerUid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const includeXrpl =
      String(c.req.query("includeXrpl") ?? c.req.query("sync") ?? "false") === "true" ||
      String(c.req.query("includeXrpl") ?? c.req.query("sync") ?? "0") === "1";

    let xrpl;
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
        createdAt: formatDate(data.createdAt)
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
    if (!asset) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
    }
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
    return jsonOk(c, {
      challenge,
      address: XRPL_VERIFY_ADDRESS,
      amountDrops: "1"
    });
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
    if (!asset) {
      return jsonError(c, 404, "NOT_FOUND", "Asset not found");
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
      {
        verificationStatus: "VERIFIED",
        verificationVerifiedAt: deps.now()
      },
      { merge: true }
    );

    return jsonOk(c);
  });

  return app;
};
