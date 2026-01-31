import { Client, Wallet } from "xrpl";
import { XRPL_URL } from "./xrpl.js";

export const resolveXrplWsUrl = (url: string) => {
  if (url.startsWith("wss://") || url.startsWith("ws://")) {
    return url;
  }
  if (url.startsWith("https://") || url.startsWith("http://")) {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    if (parsed.port === "51234") {
      parsed.port = "51233";
    }
    return parsed.toString();
  }
  return url;
};

const getXrplWsUrl = () => resolveXrplWsUrl(process.env.XRPL_WS_URL ?? XRPL_URL);

export const getWalletAddressFromSeed = (seed: string) => {
  return Wallet.fromSeed(seed).classicAddress;
};

export const createLocalXrplWallet = () => {
  const wallet = Wallet.generate();
  if (!wallet.seed) {
    throw new Error("XRPL seed is missing");
  }
  return { address: wallet.classicAddress, seed: wallet.seed };
};

export const sendXrpPayment = async (input: {
  fromSeed: string;
  fromAddress: string;
  to: string;
  amountDrops: string;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(input.fromSeed);
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: input.fromAddress,
      Destination: input.to,
      Amount: input.amountDrops
    });
    const signed = wallet.sign(prepared);
    const result = await client.submit(signed.tx_blob);
    const engineResult = result?.result?.engine_result;
    if (engineResult && !["tesSUCCESS", "terQUEUED"].includes(engineResult)) {
      throw new Error(`XRPL submit failed: ${engineResult}`);
    }
    return {
      txHash: signed.hash ?? result?.result?.tx_json?.hash ?? ""
    };
  } finally {
    await client.disconnect();
  }
};

export const sendTokenPayment = async (input: {
  fromSeed: string;
  fromAddress: string;
  to: string;
  token: { currency: string; issuer: string | null; isNative: boolean };
  amount: string;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const issuer = input.token.issuer;
    if (!issuer) {
      throw new Error("Token issuer is required");
    }
    const wallet = Wallet.fromSeed(input.fromSeed);
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: input.fromAddress,
      Destination: input.to,
      Amount: {
        currency: input.token.currency,
        issuer,
        value: input.amount
      }
    });
    const signed = wallet.sign(prepared);
    const result = await client.submit(signed.tx_blob);
    const engineResult = result?.result?.engine_result;
    if (engineResult && !["tesSUCCESS", "terQUEUED"].includes(engineResult)) {
      throw new Error(`XRPL submit failed: ${engineResult}`);
    }
    return {
      txHash: signed.hash ?? result?.result?.tx_json?.hash ?? ""
    };
  } finally {
    await client.disconnect();
  }
};
