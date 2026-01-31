import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const connect = vi.fn(async () => {});
  const disconnect = vi.fn(async () => {});
  const autofill = vi.fn(async (tx: any) => ({ ...tx, Fee: "10", Sequence: 1 }));
  const submit = vi.fn(async () => ({ result: { engine_result: "tesSUCCESS", hash: "HASH" } }));
  const clientCtor = vi.fn(() => ({ connect, disconnect, autofill, submit }));
  const sign = vi.fn(() => ({ tx_blob: "blob", hash: "SIGNED_HASH" }));
  const walletFromSeed = vi.fn(() => ({ sign }));
  const generate = vi.fn(() => ({ classicAddress: "rLocal", seed: "sLocal" }));
  return { connect, disconnect, autofill, submit, clientCtor, sign, walletFromSeed, generate };
});

vi.mock("xrpl", () => ({
  Client: mocks.clientCtor,
  Wallet: { fromSeed: mocks.walletFromSeed, generate: mocks.generate }
}));

import {
  createLocalXrplWallet,
  getWalletAddressFromSeed,
  resolveXrplWsUrl,
  sendTokenPayment,
  sendXrpPayment
} from "./xrpl-wallet.js";

describe("xrpl-wallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends xrp payment from asset account", async () => {
    const result = await sendXrpPayment({
      fromSeed: "seed",
      fromAddress: "rFrom",
      to: "rDest",
      amountDrops: "12"
    });

    expect(mocks.walletFromSeed).toHaveBeenCalledWith("seed");
    expect(mocks.autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "Payment",
        Account: "rFrom",
        Destination: "rDest",
        Amount: "12"
      })
    );
    expect(mocks.sign).toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledWith("blob");
    expect(result.txHash).toBe("SIGNED_HASH");
  });

  it("sends token payment with issuer", async () => {
    const result = await sendTokenPayment({
      fromSeed: "seed",
      fromAddress: "rFrom",
      to: "rDest",
      token: { currency: "USD", issuer: "rIssuer", isNative: false },
      amount: "9"
    });

    expect(mocks.autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "Payment",
        Account: "rFrom",
        Destination: "rDest",
        Amount: { currency: "USD", issuer: "rIssuer", value: "9" }
      })
    );
    expect(result.txHash).toBe("SIGNED_HASH");
  });

  it("resolves websocket url from https endpoint", () => {
    const resolved = resolveXrplWsUrl("https://s.altnet.rippletest.net:51234");
    expect(resolved).toBe("wss://s.altnet.rippletest.net:51233/");
  });

  it("gets classic address from seed", () => {
    mocks.walletFromSeed.mockReturnValueOnce({
      sign: mocks.sign,
      classicAddress: "rClassic"
    });
    expect(getWalletAddressFromSeed("seed")).toBe("rClassic");
  });

  it("creates local wallet with matching address", () => {
    mocks.walletFromSeed.mockReturnValueOnce({
      sign: mocks.sign,
      classicAddress: "rLocal"
    });
    const wallet = createLocalXrplWallet();
    expect(mocks.generate).toHaveBeenCalled();
    expect(wallet).toEqual({ address: "rLocal", seed: "sLocal" });
    expect(getWalletAddressFromSeed(wallet.seed)).toBe(wallet.address);
  });
});
