import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requestHandler } from "./handler";

type MockReq = {
  method: string;
  url: string;
  protocol: string;
  hostname: string;
  headers: Record<string, string>;
  body?: unknown;
};

type MockRes = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockRes;
  json: (body: unknown) => MockRes;
  send: (body: unknown) => MockRes;
};

const createRes = (): MockRes => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  }
});

describe("requestHandler", () => {
  it("forwards status and json body", async () => {
    const app = new Hono().basePath("/v1");
    app.get("/ping", (c) => c.json({ ok: true }, 201));

    const handler = requestHandler(app);
    const req: MockReq = {
      method: "GET",
      url: "/v1/ping",
      protocol: "https",
      hostname: "example.test",
      headers: {}
    };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});
