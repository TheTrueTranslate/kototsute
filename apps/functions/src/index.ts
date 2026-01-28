import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

export const api = onRequest((req, res) => {
  logger.info("api called", { method: req.method, path: req.path });
  res.json({ ok: true, message: "api ok" });
});
