import { describe, it, expect, vi } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: [] }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("assets api", () => {
  it("calls /v1/cases/:caseId/assets", async () => {
    const { listAssets } = await import("./assets");
    await listAssets("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/assets", { method: "GET" });
  });

  it("calls /v1/cases/:caseId/assets/:assetId/reserve", async () => {
    const { updateAssetReserve } = await import("./assets");
    await updateAssetReserve("case-1", "asset-1", {
      reserveXrp: "0",
      reserveTokens: []
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/assets/asset-1/reserve", {
      method: "PATCH",
      body: JSON.stringify({ reserveXrp: "0", reserveTokens: [] })
    });
  });

  it("calls /v1/cases/:caseId/assets/:assetId/history", async () => {
    const { getAssetHistory } = await import("./assets");
    await getAssetHistory("case-1", "asset-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/assets/asset-1/history", {
      method: "GET"
    });
  });

  it("calls /v1/cases/:caseId/assets/:assetId to update label", async () => {
    const { updateAssetLabel } = await import("./assets");
    await updateAssetLabel("case-1", "asset-1", { label: "新しい資産名" });
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/assets/asset-1", {
      method: "PATCH",
      body: JSON.stringify({ label: "新しい資産名" })
    });
  });
});
