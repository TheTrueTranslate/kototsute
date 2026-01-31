import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { ApiBindings } from "../types.js";
import { jsonError, jsonOk } from "../utils/response.js";

const getCaseIdFromRef = (ref: { path?: string; parent?: { parent?: { id?: string } } }) => {
  if (typeof ref.path === "string") {
    const parts = ref.path.split("/");
    const casesIndex = parts.indexOf("cases");
    if (casesIndex !== -1) {
      return parts[casesIndex + 1] ?? null;
    }
  }
  return ref.parent?.parent?.id ?? null;
};

const resolveStorageEmulatorOrigin = (host?: string | null) => {
  if (!host) return null;
  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host;
  }
  return `http://${host}`;
};

export const adminRoutes = () => {
  const app = new Hono<ApiBindings>();

  app.get("/death-claims", async (c) => {
    const auth = c.get("auth");
    if (!auth.admin) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    const status = String(c.req.query("status") ?? "").trim();
    if (!status) {
      return jsonError(c, 400, "VALIDATION_ERROR", "statusは必須です");
    }

    const db = getFirestore();
    const snapshot = await db.collectionGroup("deathClaims").where("status", "==", status).get();
    const data = snapshot.docs.map((doc) => {
      const claim = doc.data() ?? {};
      const caseId = getCaseIdFromRef(doc.ref as { path?: string; parent?: { parent?: { id?: string } } });
      return {
        caseId,
        claimId: doc.id,
        submittedByUid: claim.submittedByUid ?? null,
        status: claim.status ?? null,
        createdAt: claim.createdAt ?? null
      };
    });
    return jsonOk(c, data);
  });

  app.get("/death-claims/:caseId/:claimId", async (c) => {
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

    const caseSnap = await db.collection("cases").doc(caseId).get();
    const caseData = caseSnap.exists ? caseSnap.data() ?? {} : {};
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];

    const filesSnap = await claimRef.collection("files").get();
    const storageBucket = process.env.STORAGE_BUCKET;
    const emulatorOrigin = resolveStorageEmulatorOrigin(
      process.env.FIREBASE_STORAGE_EMULATOR_HOST
    );
    const files = await Promise.all(
      filesSnap.docs.map(async (doc) => {
        const data = doc.data() ?? {};
        let downloadUrl: string | null = null;
        const storagePath = typeof data.storagePath === "string" ? data.storagePath : null;
        if (emulatorOrigin && storageBucket && storagePath) {
          downloadUrl = `${emulatorOrigin}/v0/b/${storageBucket}/o/${encodeURIComponent(
            storagePath
          )}?alt=media`;
        } else if (storageBucket && storagePath) {
          try {
            const bucket = getStorage().bucket(storageBucket);
            const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
              action: "read",
              expires: Date.now() + 15 * 60 * 1000
            });
            downloadUrl = signedUrl;
          } catch {
            downloadUrl = null;
          }
        }
        return {
          fileId: doc.id,
          ...data,
          downloadUrl
        };
      })
    );
    const caseSummary = caseSnap.exists
      ? {
          caseId,
          ownerDisplayName: caseData.ownerDisplayName ?? null,
          stage: caseData.stage ?? null,
          assetLockStatus: caseData.assetLockStatus ?? null,
          memberCount: memberUids.length,
          createdAt: caseData.createdAt ?? null
        }
      : null;
    return jsonOk(c, { claim: { claimId, ...claimSnap.data() }, case: caseSummary, files });
  });

  app.get("/death-claims/:caseId/:claimId/files/:fileId/download", async (c) => {
    const auth = c.get("auth");
    if (!auth.admin) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    const caseId = c.req.param("caseId");
    const claimId = c.req.param("claimId");
    const fileId = c.req.param("fileId");
    const db = getFirestore();
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

  return app;
};
