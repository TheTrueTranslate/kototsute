import { describe, it, expect, vi } from "vitest";

const apiFetchMock = vi.fn(async () => ({ ok: true, data: {} }));
vi.mock("../../features/shared/lib/api", () => ({ apiFetch: apiFetchMock }));

describe("heir wallets api", () => {
  it("calls GET /v1/cases/:caseId/heir-wallet", async () => {
    const { getHeirWallet } = await import("./heir-wallets");
    await getHeirWallet("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/heir-wallet", {
      method: "GET"
    });
  });

  it("calls POST /v1/cases/:caseId/heir-wallet", async () => {
    const { saveHeirWallet } = await import("./heir-wallets");
    await saveHeirWallet("case-1", "rHeir");
    expect(apiFetchMock).toHaveBeenCalledWith("/v1/cases/case-1/heir-wallet", {
      method: "POST",
      body: JSON.stringify({ address: "rHeir" })
    });
  });

  it("calls POST /v1/cases/:caseId/heir-wallet/verify/challenge", async () => {
    const { requestHeirWalletVerifyChallenge } = await import("./heir-wallets");
    await requestHeirWalletVerifyChallenge("case-1");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/v1/cases/case-1/heir-wallet/verify/challenge",
      {
        method: "POST"
      }
    );
  });

  it("calls POST /v1/cases/:caseId/heir-wallet/verify/confirm", async () => {
    const { confirmHeirWalletVerify } = await import("./heir-wallets");
    await confirmHeirWalletVerify("case-1", "txhash");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/v1/cases/case-1/heir-wallet/verify/confirm",
      {
        method: "POST",
        body: JSON.stringify({ txHash: "txhash" })
      }
    );
  });
});
