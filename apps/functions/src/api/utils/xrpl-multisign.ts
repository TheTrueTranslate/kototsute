import { Client, Wallet, decode, hashes, multisign } from "xrpl";
import { resolveXrplWsUrl } from "@kototsute/shared";

const defaultXrplUrl = "https://s.altnet.rippletest.net:51234";

const getXrplWsUrl = () =>
  resolveXrplWsUrl(
    process.env.XRPL_WS_URL ?? process.env.XRPL_URL ?? defaultXrplUrl
  );

export const prepareApprovalTx = async (input: {
  fromAddress: string;
  destination: string;
  amountDrops: string;
  memoHex: string;
  signersCount: number;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const tx = await client.autofill(
      {
        TransactionType: "Payment",
        Account: input.fromAddress,
        Destination: input.destination,
        Amount: input.amountDrops,
        Memos: [{ Memo: { MemoData: input.memoHex } }]
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
  return {
    blob: signed.tx_blob,
    hash: signed.hash ?? ""
  };
};

export const decodeSignedBlob = (blob: string) => decode(blob);

export const hashSignedBlob = (blob: string) => hashes.hashSignedTx(blob);

export const combineMultisignedBlobs = (blobs: string[]) => {
  const combined = multisign(blobs);
  return {
    blob: combined,
    txJson: decode(combined)
  };
};

export const submitMultisignedTx = async (txJson: any) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const response = await client.request({
      command: "submit_multisigned",
      tx_json: txJson
    });
    return {
      txHash: response?.result?.hash ?? response?.result?.tx_json?.hash ?? ""
    };
  } finally {
    await client.disconnect();
  }
};
