import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: {} }))
}));

describe("admin signer-list api", () => {
  it("calls prepare approval tx endpoint", async () => {
    const { prepareApprovalTx } = await import("./signer-list");
    const { apiFetch } = await import("../lib/api");
    await prepareApprovalTx("case-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/admin/cases/case-1/signer-list/prepare", {
      method: "POST"
    });
  });
});
