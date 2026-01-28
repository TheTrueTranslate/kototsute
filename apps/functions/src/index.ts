import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import { createApiHandler, createDefaultDeps } from "./api/handler";

if (getApps().length === 0) {
  initializeApp();
}

const handler = createApiHandler(createDefaultDeps());

export const api = onRequest({ cors: true }, async (req, res) => {
  logger.info("api called", { method: req.method, path: req.path });
  return handler(req, res);
});
