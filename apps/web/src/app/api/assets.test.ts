import { describe, it, expect, vi } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: [] }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("assets api", () => {
  it("calls /v1/cases/:caseId/assets", async () => {
    const { listAssets } = await import("./assets");
    await listAssets("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/assets", { method: "GET" });
  });
});
