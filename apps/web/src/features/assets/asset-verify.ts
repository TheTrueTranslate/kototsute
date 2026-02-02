type VerifyChallenge = {
  challenge: string;
  address: string;
  amountDrops: string;
};

type AutoVerifyInput = {
  caseId: string;
  assetId: string;
  assetAddress: string;
  secret: string;
  challenge?: VerifyChallenge | null;
};

type AutoVerifyDeps = {
  requestVerifyChallenge: (caseId: string, assetId: string) => Promise<VerifyChallenge>;
  createPaymentTx: (input: {
    from: string;
    to: string;
    amount: string;
    memoHex?: string;
  }) => Promise<any>;
  signSingle: (tx: any, seed: string) => { blob: string; hash: string };
  submitSignedBlob: (blob: string) => Promise<{ txHash: string }>;
  confirmVerify: (caseId: string, assetId: string, txHash: string) => Promise<void>;
};

const encodeMemoHex = (memo: string) => {
  if (!memo) return "";
  const bytes = new TextEncoder().encode(memo);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

export const autoVerifyAssetOwnership = async (
  input: AutoVerifyInput,
  deps: AutoVerifyDeps
) => {
  const caseId = input.caseId.trim();
  const assetId = input.assetId.trim();
  const assetAddress = input.assetAddress.trim();
  const secret = input.secret.trim();
  if (!caseId || !assetId) {
    throw new Error("ケース情報が取得できません");
  }
  if (!assetAddress) {
    throw new Error("アドレスが取得できません");
  }
  if (!secret) {
    throw new Error("シークレットを入力してください");
  }

  const challenge =
    input.challenge ??
    (await deps.requestVerifyChallenge(caseId, assetId));
  const memoHex = encodeMemoHex(challenge.challenge ?? "");
  const tx = await deps.createPaymentTx({
    from: assetAddress,
    to: challenge.address,
    amount: challenge.amountDrops ?? "1",
    memoHex
  });
  const signed = deps.signSingle(tx, secret);
  const result = await deps.submitSignedBlob(signed.blob);
  await deps.confirmVerify(caseId, assetId, result.txHash);
  return { txHash: result.txHash, challenge };
};
