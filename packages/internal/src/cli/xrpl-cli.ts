import prompts from "prompts";
import { runNftMintSend, runTokenIssueSend, runXrpTransfer } from "./xrpl-actions.js";

export const runXrplCli = async (input?: { prompt?: typeof prompts }) => {
  const prompt = input?.prompt ?? prompts;
  const actionAnswer = await prompt({
    type: "select",
    name: "action",
    message: "XRPL操作を選択してください",
    choices: [
      { title: "XRP送金", value: "xrp" },
      { title: "NFTをMintして送信", value: "nft" },
      { title: "分割可能トークンを発行して送信", value: "token" }
    ]
  });

  const action = actionAnswer?.action;
  if (!action) {
    return { skipped: true } as const;
  }

  if (action === "xrp") {
    const res = await prompt([
      {
        type: "password",
        name: "fromSeed",
        message: "送信元のシード"
      },
      {
        type: "text",
        name: "fromAddress",
        message: "送信元アドレス"
      },
      {
        type: "text",
        name: "toAddress",
        message: "送信先アドレス"
      },
      {
        type: "text",
        name: "amountXrp",
        message: "送金額 (XRP)"
      }
    ]);
    if (!res?.fromSeed || !res?.fromAddress || !res?.toAddress || !res?.amountXrp) {
      return { skipped: true } as const;
    }
    return await runXrpTransfer({
      fromSeed: res.fromSeed,
      fromAddress: res.fromAddress,
      toAddress: res.toAddress,
      amountXrp: res.amountXrp
    });
  }

  if (action === "nft") {
    const res = await prompt([
      {
        type: "password",
        name: "minterSeed",
        message: "Minterのシード"
      },
      {
        type: "text",
        name: "minterAddress",
        message: "Minterのアドレス"
      },
      {
        type: "password",
        name: "recipientSeed",
        message: "受取側のシード"
      },
      {
        type: "text",
        name: "recipientAddress",
        message: "受取側アドレス"
      },
      {
        type: "text",
        name: "uri",
        message: "NFT URI"
      }
    ]);
    if (
      !res?.minterSeed ||
      !res?.minterAddress ||
      !res?.recipientSeed ||
      !res?.recipientAddress ||
      !res?.uri
    ) {
      return { skipped: true } as const;
    }
    return await runNftMintSend({
      minterSeed: res.minterSeed,
      minterAddress: res.minterAddress,
      recipientSeed: res.recipientSeed,
      recipientAddress: res.recipientAddress,
      uri: res.uri
    });
  }

  const res = await prompt([
    {
      type: "password",
      name: "issuerSeed",
      message: "発行者のシード"
    },
    {
      type: "text",
      name: "issuerAddress",
      message: "発行者アドレス"
    },
    {
      type: "password",
      name: "holderSeed",
      message: "受取側のシード"
    },
    {
      type: "text",
      name: "holderAddress",
      message: "受取側アドレス"
    },
    {
      type: "text",
      name: "currency",
      message: "通貨コード (3文字)"
    },
    {
      type: "text",
      name: "amount",
      message: "送信量"
    },
    {
      type: "text",
      name: "trustLimit",
      message: "Trust limit"
    }
  ]);

  if (
    !res?.issuerSeed ||
    !res?.issuerAddress ||
    !res?.holderSeed ||
    !res?.holderAddress ||
    !res?.currency ||
    !res?.amount ||
    !res?.trustLimit
  ) {
    return { skipped: true } as const;
  }

  return await runTokenIssueSend({
    issuerSeed: res.issuerSeed,
    issuerAddress: res.issuerAddress,
    holderSeed: res.holderSeed,
    holderAddress: res.holderAddress,
    currency: res.currency,
    amount: res.amount,
    trustLimit: res.trustLimit
  });
};
