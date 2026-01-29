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

    const db = getFirestore();
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
      verificationStatus: assetData.verificationStatus ?? "UNVERIFIED"
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

  return app;
};
