import type { Hono } from "hono";
import { createApp } from "./app.js";
import type { ApiDeps } from "./types.js";

export { createDefaultDeps } from "./deps.js";

export const requestHandler = (app: Hono<any, any, any>) => {
  return async (req: any, res: any) => {
    const method = String(req.method ?? "GET").toUpperCase();
    const protocol = req.protocol ?? "https";
    const hostname = req.hostname ?? req.headers?.host ?? "localhost";
    const url = new URL(`${protocol}://${hostname}${req.url ?? ""}`);
    const headers = new Headers();
    Object.entries(req.headers ?? {}).forEach(([key, value]) => {
      if (typeof value === "string") {
        headers.set(key, value);
        return;
      }
      if (Array.isArray(value)) {
        headers.set(key, value.join(","));
      }
    });

    let body: unknown;
    if (!["GET", "HEAD"].includes(method)) {
      const rawBody = req.body;
      if (rawBody === undefined || rawBody === null) {
        body = undefined;
      } else if (
        typeof rawBody === "string" ||
        rawBody instanceof Uint8Array ||
        rawBody instanceof ArrayBuffer
      ) {
        body = rawBody;
      } else {
        body = JSON.stringify(rawBody);
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
      }
    }

    const honoRes = await app.fetch(
      new Request(url.toString(), {
        method,
        headers,
        body: body as any
      })
    );

    if (typeof res.setHeader === "function") {
      honoRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
    }

    res.status(honoRes.status);
    const contentType = honoRes.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      res.json(await honoRes.json());
      return;
    }
    res.send(await honoRes.text());
  };
};

export const createApiHandler = (deps: ApiDeps) => requestHandler(createApp(deps));
