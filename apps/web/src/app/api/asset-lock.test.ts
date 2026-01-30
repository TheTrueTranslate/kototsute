import { describe, it, expect, vi } from "vitest";

vi.mock("../../features/shared/lib/api", () => ({
  apiFetch: vi.fn(async () => ({ data: {} }))
}));

describe("asset-lock api", () => {
  it("calls get endpoint", async () => {
    const { getAssetLock } = await import("./asset-lock");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await getAssetLock("case-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/asset-lock", { method: "GET" });
  });

  it("calls start endpoint", async () => {
    const { startAssetLock } = await import("./asset-lock");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await startAssetLock("case-1", { method: "B" });
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/asset-lock/start", {
      method: "POST",
      body: JSON.stringify({ method: "B" })
    });
  });

  it("calls verify endpoint", async () => {
    const { verifyAssetLockItem } = await import("./asset-lock");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await verifyAssetLockItem("case-1", { itemId: "item-1", txHash: "tx" });
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/asset-lock/verify", {
      method: "POST",
      body: JSON.stringify({ itemId: "item-1", txHash: "tx" })
    });
  });

  it("calls execute endpoint", async () => {
    const { executeAssetLock } = await import("./asset-lock");
    const { apiFetch } = await import("../../features/shared/lib/api");
    await executeAssetLock("case-1");
    expect(apiFetch).toHaveBeenCalledWith("/v1/cases/case-1/asset-lock/execute", {
      method: "POST"
    });
  });
});
