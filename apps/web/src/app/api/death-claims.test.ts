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

  it("calls resubmit", async () => {
    const { resubmitDeathClaim } = await import("./death-claims");
    await resubmitDeathClaim("case-1", "claim-1");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/v1/cases/case-1/death-claims/claim-1/resubmit",
      { method: "POST" }
    );
  });

  it("calls download file", async () => {
    const { downloadDeathClaimFile } = await import("./death-claims");
    await downloadDeathClaimFile("case-1", "claim-1", "file-1");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/v1/cases/case-1/death-claims/claim-1/files/file-1/download",
      { method: "GET" }
    );
  });
});
