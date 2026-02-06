import { describe, it, expect, vi } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: [] }));
vi.mock("../../features/shared/lib/api", () => ({
  apiFetch: apiFetchMock
}));

describe("plans api", () => {
  it("calls /v1/cases/:caseId/plans", async () => {
    const { listPlans } = await import("./plans");
    await listPlans("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/plans", { method: "GET" });
  });

  it("calls /v1/cases/:caseId/plans/:planId/assets/:planAssetId/nfts", async () => {
    const { updatePlanNftAllocations } = await import("./plans");
    await updatePlanNftAllocations("case-1", "plan-1", "asset-1", {
      allocations: [{ tokenId: "nft-1", heirUid: "heir-1" }]
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/v1/cases/case-1/plans/plan-1/assets/asset-1/nfts",
      {
        method: "POST",
        body: JSON.stringify({ allocations: [{ tokenId: "nft-1", heirUid: "heir-1" }] })
      }
    );
  });
});
