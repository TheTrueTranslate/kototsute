import { describe, it, expect, vi } from "vitest";

const autofillMock = vi.fn(async (tx: any) => ({ ...tx, Fee: "10" }));
const connectMock = vi.fn(async () => undefined);
const disconnectMock = vi.fn(async () => undefined);
const submitMock = vi.fn(async () => ({ result: { engine_result: "tesSUCCESS" } }));
const signMock = vi.fn(() => ({ tx_blob: "blob", hash: "hash" }));

vi.mock("xrpl", () => ({
  Client: class {
    connect = connectMock;
    disconnect = disconnectMock;
    autofill = autofillMock;
    submit = submitMock;
  },
  Wallet: { fromSeed: () => ({ sign: signMock }) },
  hashes: { hashSignedTx: () => "hash-from-blob" }
}));

describe("xrpl client helpers", () => {
  it("creates payment tx with autofill", async () => {
    const { createPaymentTx } = await import("./xrpl-client");
    const tx = await createPaymentTx({
      from: "rFrom",
      to: "rTo",
      amount: "1",
      memoHex: "AB"
    });
    expect(tx.TransactionType).toBe("Payment");
    expect(tx.Fee).toBe("10");
  });

  it("signs for multisign", async () => {
    const { signForMultisign } = await import("./xrpl-client");
    const result = signForMultisign({ TransactionType: "Payment" }, "sSeed");
    expect(result.blob).toBe("blob");
    expect(result.hash).toBe("hash");
  });

  it("submits signed blob", async () => {
    const { submitSignedBlob } = await import("./xrpl-client");
    const result = await submitSignedBlob("blob");
    expect(result.txHash).toBe("hash-from-blob");
  });
});
