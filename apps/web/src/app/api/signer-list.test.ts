import { describe, it, expect, vi } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: {} }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("signer list api", () => {
  it("fetches signer list", async () => {
    const { getSignerList } = await import("./signer-list");
    await getSignerList("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/signer-list", {
      method: "GET"
    });
  });

  it("fetches approval tx", async () => {
    const { getApprovalTx } = await import("./signer-list");
    await getApprovalTx("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/signer-list/approval-tx", {
      method: "GET"
    });
  });

  it("submits signed blob", async () => {
    const { submitSignerSignature } = await import("./signer-list");
    await submitSignerSignature("case-1", "blob-signed");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/signer-list/sign", {
      method: "POST",
      body: JSON.stringify({ signedBlob: "blob-signed" })
    });
  });

  it("prepares approval tx", async () => {
    const { prepareApprovalTx } = await import("./signer-list");
    await prepareApprovalTx("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/signer-list/prepare", {
      method: "POST"
    });
  });
});
