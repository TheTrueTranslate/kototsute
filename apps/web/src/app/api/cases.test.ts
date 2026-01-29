import { describe, it, expect, vi } from "vitest";
const apiFetchMock = vi.fn(async () => ({ ok: true, data: { created: [], received: [] } }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("cases api", () => {
  it("calls /v1/cases", async () => {
    const { listCases } = await import("./cases");
    await listCases();
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases", { method: "GET" });
  });
});
