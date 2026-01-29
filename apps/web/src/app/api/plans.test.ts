import { describe, it, expect, vi } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: [] }));
vi.mock("../../features/shared/lib/api", () => ({
  apiFetch: apiFetchMock
}));

describe("plans api", () => {
  it("calls /v1/plans", async () => {
    const { listPlans } = await import("./plans");
    await listPlans();
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/plans", { method: "GET" });
  });
});
