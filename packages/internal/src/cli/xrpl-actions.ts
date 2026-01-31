import { xrpToDrops } from "xrpl";
import { issueAndSendToken, mintAndSendNft, sendXrpPayment } from "@kototsute/shared";

export const runXrpTransfer = async (input: {
  fromSeed: string;
  fromAddress: string;
  toAddress: string;
  amountXrp: string;
}) => {
  const amountDrops = xrpToDrops(input.amountXrp);
  return await sendXrpPayment({
    fromSeed: input.fromSeed,
    fromAddress: input.fromAddress,
    to: input.toAddress,
    amountDrops
  });
};

export const runTokenIssueSend = async (input: {
  issuerSeed: string;
  issuerAddress: string;
  holderSeed: string;
  holderAddress: string;
  currency: string;
  amount: string;
  trustLimit: string;
}) => {
  return await issueAndSendToken({
    issuerSeed: input.issuerSeed,
    issuerAddress: input.issuerAddress,
    holderSeed: input.holderSeed,
    holderAddress: input.holderAddress,
    currency: input.currency,
    amount: input.amount,
    trustLimit: input.trustLimit
  });
};

export const runNftMintSend = async (input: {
  minterSeed: string;
  minterAddress: string;
  recipientSeed: string;
  recipientAddress: string;
  uri: string;
}) => {
  return await mintAndSendNft({
    minterSeed: input.minterSeed,
    minterAddress: input.minterAddress,
    recipientSeed: input.recipientSeed,
    recipientAddress: input.recipientAddress,
    uri: input.uri
  });
};
