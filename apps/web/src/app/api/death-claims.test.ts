import { describe, it, expect, vi } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: {} }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("death claims api", () => {
  it("calls submit", async () => {
    const { submitDeathClaim } = await import("./death-claims");
    await submitDeathClaim("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/death-claims", {
      method: "POST"
    });
  });
});
