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
});
