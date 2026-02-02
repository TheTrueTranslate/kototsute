import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  grantAdminByEmail: vi.fn(async () => ({ uid: "uid", updated: true }))
}));

vi.mock("./admin-actions.js", () => ({
  grantAdminByEmail: mocks.grantAdminByEmail
}));

import { runAdminCli } from "./admin-cli.js";

describe("admin cli", () => {
  it("prompts for email and grants admin", async () => {
    const prompt = vi.fn(async () => ({ email: "a@example.com" }));
    const result = await runAdminCli({ prompt });

    expect(mocks.grantAdminByEmail).toHaveBeenCalledWith({
      email: "a@example.com",
      projectId: "kototsute"
    });
    expect(result).toEqual({ uid: "uid", updated: true, email: "a@example.com" });
  });
});
