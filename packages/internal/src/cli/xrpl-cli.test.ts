import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runXrpTransfer: vi.fn(async () => ({ txHash: "xrp-hash" })),
  runTokenIssueSend: vi.fn(async () => ({ txHash: "token-hash" })),
  runNftMintSend: vi.fn(async () => ({ txHash: "nft-hash" }))
}));

vi.mock("./xrpl-actions.js", () => ({
  runXrpTransfer: mocks.runXrpTransfer,
  runTokenIssueSend: mocks.runTokenIssueSend,
  runNftMintSend: mocks.runNftMintSend
}));

vi.mock("node:crypto", () => ({
  randomUUID: () => "test-uuid"
}));

import { runXrplCli } from "./xrpl-cli.js";

describe("xrpl cli", () => {
  it("runs XRP transfer flow", async () => {
    const prompt = vi
      .fn()
      .mockResolvedValueOnce({ action: "xrp" })
      .mockResolvedValueOnce({
        fromSeed: "seed",
        fromAddress: "rFrom",
        toAddress: "rTo",
        amountXrp: "1"
      });

    const result = await runXrplCli({ prompt });

    expect(mocks.runXrpTransfer).toHaveBeenCalledWith({
      fromSeed: "seed",
      fromAddress: "rFrom",
      toAddress: "rTo",
      amountXrp: "1"
    });
    expect(result).toEqual({ txHash: "xrp-hash" });
  });

  it("runs NFT flow", async () => {
    const prompt = vi
      .fn()
      .mockResolvedValueOnce({ action: "nft" })
      .mockResolvedValueOnce({
        minterSeed: "seed",
        minterAddress: "rMinter",
        recipientSeed: "holder",
        recipientAddress: "rHolder"
      });

    const result = await runXrplCli({ prompt });

    expect(mocks.runNftMintSend).toHaveBeenCalledWith({
      minterSeed: "seed",
      minterAddress: "rMinter",
      recipientSeed: "holder",
      recipientAddress: "rHolder",
      uri: "urn:uuid:test-uuid"
    });
    expect(result).toEqual({ txHash: "nft-hash" });
  });

  it("runs token issue flow", async () => {
    const prompt = vi
      .fn()
      .mockResolvedValueOnce({ action: "token" })
      .mockResolvedValueOnce({
        issuerSeed: "issuer",
        issuerAddress: "rIssuer",
        holderSeed: "holder",
        holderAddress: "rHolder",
        currency: "USD",
        amount: "10",
        trustLimit: "100"
      });

    const result = await runXrplCli({ prompt });

    expect(mocks.runTokenIssueSend).toHaveBeenCalledWith({
      issuerSeed: "issuer",
      issuerAddress: "rIssuer",
      holderSeed: "holder",
      holderAddress: "rHolder",
      currency: "USD",
      amount: "10",
      trustLimit: "100"
    });
    expect(result).toEqual({ txHash: "token-hash" });
  });
});
