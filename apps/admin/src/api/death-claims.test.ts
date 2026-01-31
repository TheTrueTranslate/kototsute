import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: {} }))
}));

describe("admin death-claims api", () => {
  it("calls reject endpoint", async () => {
    const { rejectDeathClaim } = await import("./death-claims");
    const { apiFetch } = await import("../lib/api");
    await rejectDeathClaim("case-1", "claim-1", { note: "NG" });
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/death-claims/claim-1/admin-reject", {
      method: "POST",
      body: JSON.stringify({ note: "NG" })
    });
  });
});
