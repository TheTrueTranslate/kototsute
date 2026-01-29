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
});
