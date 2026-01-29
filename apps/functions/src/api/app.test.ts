import { describe, it, expect } from "vitest";
import { createApp } from "./app";

const deps = {
  repo: { findById: async () => null } as any,
  now: () => new Date("2024-01-01T00:00:00.000Z"),
  getAuthUser: async () => ({ uid: "u1", email: "u1@example.com" }),
  getOwnerUidForRead: async (uid: string) => uid
};

describe("createApp", () => {
  it("returns 404 json for unknown route", async () => {
    const app = createApp(deps as any);
    const res = await app.request("/v1/unknown");
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body).toEqual({ ok: false, code: "NOT_FOUND", message: "Not found" });
  });
});
