import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const connect = vi.fn(async () => {});
  const disconnect = vi.fn(async () => {});
  const autofill = vi.fn(async (tx: any) => ({ ...tx, Fee: "10", Sequence: 1 }));
  const submit = vi.fn(async () => ({ result: { engine_result: "tesSUCCESS", hash: "HASH" } }));
  const submitAndWait = vi.fn(async () => ({ result: { meta: { nftoken_id: "nftoken" } } }));
  const request = vi.fn(async (payload?: any) => {
    if (payload?.command === "nft_sell_offers") {
      return { result: { offers: [{ nft_offer_index: "offer" }] } };
    }
    return { result: { account_nfts: [{ NFTokenID: "nftoken" }] } };
  });
  const clientCtor = vi.fn(() => ({
    connect,
    disconnect,
    autofill,
    submit,
    submitAndWait,
    request
  }));
  const sign = vi.fn(() => ({ tx_blob: "blob", hash: "SIGNED_HASH" }));
  const walletFromSeed = vi.fn(() => ({ sign }));
  const generate = vi.fn(() => ({ classicAddress: "rLocal", seed: "sLocal" }));
  return {
    connect,
    disconnect,
    autofill,
    submit,
    submitAndWait,
    request,
    clientCtor,
    sign,
    walletFromSeed,
    generate
  };
});

vi.mock("xrpl", () => ({
  Client: mocks.clientCtor,
  Wallet: { fromSeed: mocks.walletFromSeed, generate: mocks.generate }
}));

import {
  createLocalXrplWallet,
  getWalletAddressFromSeed,
  issueAndSendToken,
  mintAndSendNft,
  resolveXrplWsUrl,
  sendSignerListSet,
  sendTokenPayment,
  sendXrpPayment,
  setTrustLine
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

  it("submits signer list set", async () => {
    const result = await sendSignerListSet({
      fromSeed: "seed",
      fromAddress: "rFrom",
      signerEntries: [{ account: "rSigner", weight: 1 }],
      quorum: 2
    });

    expect(mocks.autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "SignerListSet",
        Account: "rFrom",
        SignerQuorum: 2,
        SignerEntries: [{ SignerEntry: { Account: "rSigner", SignerWeight: 1 } }]
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

  it("sets trust line", async () => {
    await setTrustLine({
      fromSeed: "seed",
      fromAddress: "rHolder",
      issuer: "rIssuer",
      currency: "USD",
      limit: "1000"
    });

    expect(mocks.autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "TrustSet",
        Account: "rHolder",
        LimitAmount: { currency: "USD", issuer: "rIssuer", value: "1000" }
      })
    );
  });

  it("issues and sends token", async () => {
    const result = await issueAndSendToken({
      issuerSeed: "seed",
      issuerAddress: "rIssuer",
      holderSeed: "holder",
      holderAddress: "rHolder",
      currency: "USD",
      amount: "10",
      trustLimit: "100"
    });

    expect(mocks.autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "Payment",
        Account: "rIssuer",
        Destination: "rHolder",
        Amount: { currency: "USD", issuer: "rIssuer", value: "10" }
      })
    );
    expect(result.txHash).toBe("SIGNED_HASH");
  });

  it("mints and sends NFT", async () => {
    const result = await mintAndSendNft({
      minterSeed: "seed",
      minterAddress: "rMinter",
      recipientSeed: "holder",
      recipientAddress: "rHolder",
      uri: "https://example.com/nft/1"
    });

    expect(mocks.autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "NFTokenMint",
        Account: "rMinter"
      })
    );
    expect(mocks.autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "NFTokenCreateOffer",
        Account: "rMinter",
        Destination: "rHolder"
      })
    );
    expect(mocks.autofill).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactionType: "NFTokenAcceptOffer",
        Account: "rHolder"
      })
    );
    expect(result.txHash).toBe("SIGNED_HASH");
  });
});
