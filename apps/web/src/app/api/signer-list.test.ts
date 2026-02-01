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

  it("submits signer tx hash", async () => {
    const { submitSignerSignature } = await import("./signer-list");
    await submitSignerSignature("case-1", "tx_hash");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/signer-list/sign", {
      method: "POST",
      body: JSON.stringify({ txHash: "tx_hash" })
    });
  });
});
