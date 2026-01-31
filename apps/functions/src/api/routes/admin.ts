import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
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
    const files = filesSnap.docs.map((doc) => ({
      fileId: doc.id,
      ...doc.data()
    }));
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

  return app;
};
