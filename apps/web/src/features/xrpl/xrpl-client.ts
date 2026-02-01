import { Client, Wallet, hashes } from "xrpl";

const resolveWsUrl = () =>
  (import.meta as any).env?.VITE_XRPL_WS_URL ?? "wss://s.altnet.rippletest.net:51233";

export const createPaymentTx = async (input: {
  from: string;
  to: string;
  amount: string | { currency: string; issuer: string; value: string };
  memoHex?: string;
  signersCount?: number;
}) => {
  const client = new Client(resolveWsUrl());
  await client.connect();
  try {
    const tx = await client.autofill(
      {
        TransactionType: "Payment",
        Account: input.from,
        Destination: input.to,
        Amount: input.amount,
        ...(input.memoHex ? { Memos: [{ Memo: { MemoData: input.memoHex } }] } : {})
      },
      input.signersCount
    );
    return tx;
  } finally {
    await client.disconnect();
  }
};

export const signForMultisign = (tx: any, seed: string) => {
  const wallet = Wallet.fromSeed(seed);
  const signed = wallet.sign(tx, true);
  return { blob: signed.tx_blob, hash: signed.hash ?? "" };
};

export const signSingle = (tx: any, seed: string) => {
  const wallet = Wallet.fromSeed(seed);
  const signed = wallet.sign(tx);
  return { blob: signed.tx_blob, hash: signed.hash ?? "" };
};

export const submitSignedBlob = async (blob: string) => {
  const client = new Client(resolveWsUrl());
  await client.connect();
  try {
    const response = await client.submit(blob);
    return {
      txHash: hashes.hashSignedTx(blob),
      engineResult: response?.result?.engine_result ?? null
    };
  } finally {
    await client.disconnect();
  }
};
