import type { MiddlewareHandler } from "hono";
import type { ApiBindings } from "../types.js";

export const createAuthMiddleware = (): MiddlewareHandler<ApiBindings> => {
  return async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    const deps = c.get("deps");
    const authHeader = c.req.header("Authorization");
    const auth = await deps.getAuthUser(authHeader);
    c.set("auth", auth);
    await next();
  };
};
