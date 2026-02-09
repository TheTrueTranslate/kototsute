import { describe, it, expect, vi } from "vitest";

vi.mock("../../features/shared/lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: {} }))
}));

describe("distribution api", () => {
  it("calls execute endpoint", async () => {
    const { executeDistribution } = await import("./distribution");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await executeDistribution("case-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/distribution/execute", {
      method: "POST"
    });
  });

  it("calls items endpoint", async () => {
    const { listDistributionItems } = await import("./distribution");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await listDistributionItems("case-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/distribution/items", {
      method: "GET"
    });
  });

  it("calls receive tx record endpoint", async () => {
    const { recordDistributionReceiveTx } = await import("./distribution");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await recordDistributionReceiveTx("case-1", "item-1", "tx-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/distribution/items/item-1/receive", {
      method: "POST",
      body: JSON.stringify({ txHash: "tx-1" })
    });
  });
});
