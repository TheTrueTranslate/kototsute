import "dotenv/config";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import cors from "cors";
import { createApiHandler, createDefaultDeps } from "./api/handler";

if (getApps().length === 0) {
  initializeApp();
}

const handler = createApiHandler(createDefaultDeps());
const corsHandler = cors({
  origin: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
});

export const api = onRequest(async (req, res) => {
  logger.info("api called", { method: req.method, path: req.path });
  return corsHandler(req, res, () => handler(req, res));
});
