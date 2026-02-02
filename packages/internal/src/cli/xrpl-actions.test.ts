import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendXrpPayment: vi.fn(async () => ({ txHash: "hash" })),
  issueAndSendToken: vi.fn(async () => ({ txHash: "token-hash" })),
  mintAndSendNft: vi.fn(async () => ({ txHash: "nft-hash" }))
}));

vi.mock("@kototsute/shared", () => ({
  sendXrpPayment: mocks.sendXrpPayment,
  issueAndSendToken: mocks.issueAndSendToken,
  mintAndSendNft: mocks.mintAndSendNft
}));

import { runNftMintSend, runTokenIssueSend, runXrpTransfer } from "./xrpl-actions.js";

describe("xrpl actions", () => {
  it("transfers XRP", async () => {
    const result = await runXrpTransfer({
      fromSeed: "seed",
      fromAddress: "rFrom",
      toAddress: "rTo",
      amountXrp: "1"
    });

    expect(mocks.sendXrpPayment).toHaveBeenCalledWith({
      fromSeed: "seed",
      fromAddress: "rFrom",
      to: "rTo",
      amountDrops: "1000000"
    });
    expect(result.txHash).toBe("hash");
  });

  it("issues and sends token", async () => {
    const result = await runTokenIssueSend({
      issuerSeed: "issuer",
      issuerAddress: "rIssuer",
      holderSeed: "holder",
      holderAddress: "rHolder",
      currency: "USD",
      amount: "10",
      trustLimit: "100"
    });

    expect(mocks.issueAndSendToken).toHaveBeenCalledWith({
      issuerSeed: "issuer",
      issuerAddress: "rIssuer",
      holderSeed: "holder",
      holderAddress: "rHolder",
      currency: "USD",
      amount: "10",
      trustLimit: "100"
    });
    expect(result.txHash).toBe("token-hash");
  });

  it("mints and sends NFT", async () => {
    const result = await runNftMintSend({
      minterSeed: "seed",
      minterAddress: "rMinter",
      recipientSeed: "holder",
      recipientAddress: "rHolder",
      uri: "https://example.com/nft/1"
    });

    expect(mocks.mintAndSendNft).toHaveBeenCalledWith({
      minterSeed: "seed",
      minterAddress: "rMinter",
      recipientSeed: "holder",
      recipientAddress: "rHolder",
      uri: "https://example.com/nft/1"
    });
    expect(result.txHash).toBe("nft-hash");
  });
});
