import { describe, it, expect, vi } from "vitest";
import { autoVerifyWalletOwnership } from "./wallet-verify";

describe("autoVerifyWalletOwnership", () => {
  it("requests challenge and confirms verification with tx hash", async () => {
    const requestChallenge = vi.fn().mockResolvedValue({
      challenge: "abc",
      address: "rVerify",
      amountDrops: "1"
    });
    const createPaymentTx = vi.fn().mockResolvedValue({ tx: "signed" });
    const signSingle = vi.fn().mockReturnValue({ blob: "blob", hash: "hash" });
    const submitSignedBlob = vi.fn().mockResolvedValue({ txHash: "txhash" });
    const confirmVerify = vi.fn().mockResolvedValue(undefined);

    const result = await autoVerifyWalletOwnership(
      {
        walletAddress: "rFrom",
        secret: "sSecret",
        challenge: null
      },
      {
        requestChallenge,
        createPaymentTx,
        signSingle,
        submitSignedBlob,
        confirmVerify
      }
    );

    expect(requestChallenge).toHaveBeenCalled();
    expect(createPaymentTx).toHaveBeenCalledWith({
      from: "rFrom",
      to: "rVerify",
      amount: "1",
      memoHex: "616263"
    });
    expect(signSingle).toHaveBeenCalledWith({ tx: "signed" }, "sSecret");
    expect(submitSignedBlob).toHaveBeenCalledWith("blob");
    expect(confirmVerify).toHaveBeenCalledWith("txhash");
    expect(result.txHash).toBe("txhash");
  });
});
