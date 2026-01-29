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
