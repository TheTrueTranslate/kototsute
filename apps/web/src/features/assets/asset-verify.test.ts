import { describe, it, expect, vi } from "vitest";
import { autoVerifyAssetOwnership } from "./asset-verify";

describe("autoVerifyAssetOwnership", () => {
  it("requests challenge and confirms verification with tx hash", async () => {
    const requestVerifyChallenge = vi.fn().mockResolvedValue({
      challenge: "abc",
      address: "rVerify",
      amountDrops: "1"
    });
    const createPaymentTx = vi.fn().mockResolvedValue({ tx: "signed" });
    const signSingle = vi.fn().mockReturnValue({ blob: "blob", hash: "hash" });
    const submitSignedBlob = vi.fn().mockResolvedValue({ txHash: "txhash" });
    const confirmVerify = vi.fn().mockResolvedValue(undefined);

    const result = await autoVerifyAssetOwnership(
      {
        caseId: "case-1",
        assetId: "asset-1",
        assetAddress: "rFrom",
        secret: "sSecret",
        challenge: null
      },
      {
        requestVerifyChallenge,
        createPaymentTx,
        signSingle,
        submitSignedBlob,
        confirmVerify
      }
    );

    expect(requestVerifyChallenge).toHaveBeenCalledWith("case-1", "asset-1");
    expect(createPaymentTx).toHaveBeenCalledWith({
      from: "rFrom",
      to: "rVerify",
      amount: "1",
      memoHex: "616263"
    });
    expect(signSingle).toHaveBeenCalledWith({ tx: "signed" }, "sSecret");
    expect(submitSignedBlob).toHaveBeenCalledWith("blob");
    expect(confirmVerify).toHaveBeenCalledWith("case-1", "asset-1", "txhash");
    expect(result.txHash).toBe("txhash");
  });
});
