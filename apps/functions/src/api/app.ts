import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import * as logger from "firebase-functions/logger";
import { DomainError } from "@kototsute/shared";
import type { ApiBindings, ApiDeps } from "./types";
import { createAuthMiddleware } from "./middlewares/auth";
import { assetsRoutes } from "./routes/assets";
import { invitesRoutes } from "./routes/invites";
import { plansRoutes } from "./routes/plans";
import { notificationsRoutes } from "./routes/notifications";
import { jsonError } from "./utils/response";

export const createApp = (deps: ApiDeps) => {
  const app = new Hono<ApiBindings>().basePath("/v1");

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  app.use(
    "*",
    cors({
      origin: (origin) => origin ?? "*",
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"]
    })
  );

  const authMiddleware = createAuthMiddleware();

  const assets = new Hono<ApiBindings>();
  assets.use("*", authMiddleware);
  assets.route("/", assetsRoutes());
  app.route("/assets", assets);

  const invites = new Hono<ApiBindings>();
  invites.use("*", authMiddleware);
  invites.route("/", invitesRoutes());
  app.route("/invites", invites);

  const plans = new Hono<ApiBindings>();
  plans.use("*", authMiddleware);
  plans.route("/", plansRoutes());
  app.route("/plans", plans);

  const notifications = new Hono<ApiBindings>();
  notifications.use("*", authMiddleware);
  notifications.route("/", notificationsRoutes());
  app.route("/notifications", notifications);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err?.message === "UNAUTHORIZED") {
      return jsonError(c, 401, "UNAUTHORIZED", "認証が必要です");
    }
    if (err instanceof DomainError) {
      return jsonError(c, 400, err.code, err.message);
    }
    logger.error(err);
    return jsonError(c, 500, "INTERNAL_ERROR", "Internal server error");
  });

  app.notFound((c) => jsonError(c, 404, "NOT_FOUND", "Not found"));

  return app;
};
