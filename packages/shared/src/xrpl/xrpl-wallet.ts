import { Client, Wallet } from "xrpl";

const DEFAULT_XRPL_URL = "https://s.altnet.rippletest.net:51234";

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

const getXrplWsUrl = () =>
  resolveXrplWsUrl(process.env.XRPL_WS_URL ?? process.env.XRPL_URL ?? DEFAULT_XRPL_URL);

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

export const sendSignerListSet = async (input: {
  fromSeed: string;
  fromAddress: string;
  signerEntries: Array<{ account: string; weight: number }>;
  quorum: number;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(input.fromSeed);
    const prepared = await client.autofill({
      TransactionType: "SignerListSet",
      Account: input.fromAddress,
      SignerQuorum: input.quorum,
      SignerEntries: input.signerEntries.map((entry) => ({
        SignerEntry: { Account: entry.account, SignerWeight: entry.weight }
      }))
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

export const setTrustLine = async (input: {
  fromSeed: string;
  fromAddress: string;
  issuer: string;
  currency: string;
  limit: string;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(input.fromSeed);
    const prepared = await client.autofill({
      TransactionType: "TrustSet",
      Account: input.fromAddress,
      LimitAmount: {
        currency: input.currency,
        issuer: input.issuer,
        value: input.limit
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

export const issueAndSendToken = async (input: {
  issuerSeed: string;
  issuerAddress: string;
  holderSeed: string;
  holderAddress: string;
  currency: string;
  amount: string;
  trustLimit: string;
}) => {
  await setTrustLine({
    fromSeed: input.holderSeed,
    fromAddress: input.holderAddress,
    issuer: input.issuerAddress,
    currency: input.currency,
    limit: input.trustLimit
  });

  return await sendTokenPayment({
    fromSeed: input.issuerSeed,
    fromAddress: input.issuerAddress,
    to: input.holderAddress,
    token: { currency: input.currency, issuer: input.issuerAddress, isNative: false },
    amount: input.amount
  });
};

const encodeUriToHex = (uri: string) => Buffer.from(uri, "utf8").toString("hex").toUpperCase();

const resolveNftTokenId = async (
  client: Client,
  minterAddress: string,
  mintResult: any
) => {
  const directTokenId = mintResult?.result?.meta?.nftoken_id;
  if (typeof directTokenId === "string" && directTokenId) {
    return directTokenId;
  }
  const request = (client as any).request?.bind(client);
  if (!request) {
    throw new Error("XRPL client request is unavailable");
  }
  const accountNfts = await request({ command: "account_nfts", account: minterAddress });
  const tokenId = accountNfts?.result?.account_nfts?.[0]?.NFTokenID;
  if (!tokenId) {
    throw new Error("NFToken ID not found");
  }
  return tokenId;
};

const resolveNftOfferId = async (client: Client, tokenId: string, createResult: any) => {
  const directOfferId =
    createResult?.result?.meta?.offer_id ??
    createResult?.result?.meta?.nft_offer_id ??
    createResult?.result?.offer_id ??
    createResult?.result?.nft_offer_id;
  if (typeof directOfferId === "string" && directOfferId) {
    return directOfferId;
  }
  const request = (client as any).request?.bind(client);
  if (!request) {
    throw new Error("XRPL client request is unavailable");
  }
  const offers = await request({ command: "nft_sell_offers", nft_id: tokenId });
  const offerId = offers?.result?.offers?.[0]?.nft_offer_index;
  if (!offerId) {
    throw new Error("NFToken offer ID not found");
  }
  return offerId;
};

export const mintAndSendNft = async (input: {
  minterSeed: string;
  minterAddress: string;
  recipientSeed: string;
  recipientAddress: string;
  uri: string;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const minterWallet = Wallet.fromSeed(input.minterSeed);
    const recipientWallet = Wallet.fromSeed(input.recipientSeed);
    const sellOfferFlag = 1;
    const mintPrepared = await client.autofill({
      TransactionType: "NFTokenMint",
      Account: input.minterAddress,
      URI: encodeUriToHex(input.uri),
      Flags: 8,
      NFTokenTaxon: 0
    });
    const mintSigned = minterWallet.sign(mintPrepared);
    const submitAndWait = (client as any).submitAndWait?.bind(client);
    const mintResult = submitAndWait
      ? await submitAndWait(mintSigned.tx_blob)
      : await client.submit(mintSigned.tx_blob);
    const mintEngineResult = mintResult?.result?.engine_result;
    if (mintEngineResult && !["tesSUCCESS", "terQUEUED"].includes(mintEngineResult)) {
      throw new Error(`XRPL submit failed: ${mintEngineResult}`);
    }
    const tokenId = await resolveNftTokenId(client, input.minterAddress, mintResult);

    const offerPrepared = await client.autofill({
      TransactionType: "NFTokenCreateOffer",
      Account: input.minterAddress,
      NFTokenID: tokenId,
      Destination: input.recipientAddress,
      Amount: "0",
      Flags: sellOfferFlag
    });
    const offerSigned = minterWallet.sign(offerPrepared);
    const offerResult = await client.submit(offerSigned.tx_blob);
    const offerEngineResult = offerResult?.result?.engine_result;
    if (offerEngineResult && !["tesSUCCESS", "terQUEUED"].includes(offerEngineResult)) {
      throw new Error(`XRPL submit failed: ${offerEngineResult}`);
    }

    const offerId = await resolveNftOfferId(client, tokenId, offerResult);
    const acceptPrepared = await client.autofill({
      TransactionType: "NFTokenAcceptOffer",
      Account: input.recipientAddress,
      NFTokenSellOffer: offerId
    });
    const acceptSigned = recipientWallet.sign(acceptPrepared);
    const acceptResult = await client.submit(acceptSigned.tx_blob);
    const acceptEngineResult = acceptResult?.result?.engine_result;
    if (acceptEngineResult && !["tesSUCCESS", "terQUEUED"].includes(acceptEngineResult)) {
      throw new Error(`XRPL submit failed: ${acceptEngineResult}`);
    }
    return {
      txHash: acceptSigned.hash ?? acceptResult?.result?.tx_json?.hash ?? ""
    };
  } finally {
    await client.disconnect();
  }
};

export const createNftSellOffer = async (input: {
  sellerSeed: string;
  sellerAddress: string;
  tokenId: string;
  destinationAddress: string;
  amountDrops?: string;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const sellerWallet = Wallet.fromSeed(input.sellerSeed);
    const offerPrepared = await client.autofill({
      TransactionType: "NFTokenCreateOffer",
      Account: input.sellerAddress,
      NFTokenID: input.tokenId,
      Destination: input.destinationAddress,
      Amount: input.amountDrops ?? "0",
      Flags: 1
    });
    const offerSigned = sellerWallet.sign(offerPrepared);
    const offerResult = await client.submit(offerSigned.tx_blob);
    const offerEngineResult = offerResult?.result?.engine_result;
    if (offerEngineResult && !["tesSUCCESS", "terQUEUED"].includes(offerEngineResult)) {
      throw new Error(`XRPL submit failed: ${offerEngineResult}`);
    }
    const offerId = await resolveNftOfferId(client, input.tokenId, offerResult);
    return {
      offerId,
      txHash: offerSigned.hash ?? offerResult?.result?.tx_json?.hash ?? ""
    };
  } finally {
    await client.disconnect();
  }
};

export const acceptNftSellOffer = async (input: {
  buyerSeed: string;
  buyerAddress: string;
  offerId: string;
}) => {
  const client = new Client(getXrplWsUrl());
  await client.connect();
  try {
    const buyerWallet = Wallet.fromSeed(input.buyerSeed);
    const acceptPrepared = await client.autofill({
      TransactionType: "NFTokenAcceptOffer",
      Account: input.buyerAddress,
      NFTokenSellOffer: input.offerId
    });
    const acceptSigned = buyerWallet.sign(acceptPrepared);
    const acceptResult = await client.submit(acceptSigned.tx_blob);
    const acceptEngineResult = acceptResult?.result?.engine_result;
    if (acceptEngineResult && !["tesSUCCESS", "terQUEUED"].includes(acceptEngineResult)) {
      throw new Error(`XRPL submit failed: ${acceptEngineResult}`);
    }
    return {
      txHash: acceptSigned.hash ?? acceptResult?.result?.tx_json?.hash ?? ""
    };
  } finally {
    await client.disconnect();
  }
};
