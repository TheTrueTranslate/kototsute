import {
  FirestoreAssetRepository,
  ListAssetsByOwner,
  RegisterAsset,
  AssetIdentifier,
  OwnerId,
  OccurredAt,
  AssetRepository
} from "@kototsute/asset";
import { DomainError, isXrpAddress } from "@kototsute/shared";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export type ApiDeps = {
  repo: AssetRepository;
  now: () => Date;
  getUid: (req: any) => Promise<string>;
  getOwnerUidForRead: (uid: string) => Promise<string>;
};

const json = (res: any, status: number, body: any) => {
  res.status(status).json(body);
};

const unauthorizedError = () => new Error("UNAUTHORIZED");

export const createApiHandler = (deps: ApiDeps) => {
  return async (req: any, res: any) => {
    try {
      const method = req.method ?? "";
      const path = String(req.path ?? req.url ?? "").split("?")[0];

      if (path === "/v1/assets" && method === "POST") {
        const uid = await deps.getUid(req);
        const { label, address } = req.body ?? {};

        if (typeof label !== "string" || label.trim().length === 0) {
          return json(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "ラベルは必須です" });
        }
        if (typeof address !== "string" || !isXrpAddress(address)) {
          return json(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "XRPアドレスが不正です" });
        }

        const usecase = new RegisterAsset(deps.repo);
        const now = OccurredAt.create(deps.now());
        const asset = await usecase.execute({
          ownerId: OwnerId.create(uid),
          type: "CRYPTO_WALLET",
          identifier: AssetIdentifier.create(address),
          label: label.trim(),
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

        return json(res, 200, {
          ok: true,
          data: assets.map((asset) => ({
            assetId: asset.getAssetId().toString(),
            label: asset.getLabel(),
            address: asset.getIdentifier().toString(),
            createdAt: asset.getCreatedAt().toDate().toISOString()
          }))
        });
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

  return {
    repo,
    now: () => new Date(),
    getUid: async (req: any) => {
      const authHeader = req.get?.("Authorization") ?? "";
      const match = authHeader.match(/^Bearer (.+)$/);
      if (!match) {
        throw unauthorizedError();
      }
      const decoded = await getAuth().verifyIdToken(match[1]);
      return decoded.uid;
    },
    getOwnerUidForRead: async (uid: string) => {
      const doc = await getFirestore().collection("heirs").doc(uid).get();
      if (!doc.exists) return uid;
      return (doc.data()?.ownerUid as string) ?? uid;
    }
  };
};
