import { Hono } from "hono";
import { displayNameSchema } from "@kototsute/shared";
import type { ApiBindings } from "../types.js";
import { jsonError, jsonOk } from "../utils/response.js";

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

  return app;
};
