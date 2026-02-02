type VerifyChallenge = {
  challenge: string;
  address: string;
  amountDrops: string;
};

type AutoVerifyInput = {
  walletAddress: string;
  secret: string;
  challenge?: VerifyChallenge | null;
};

type AutoVerifyDeps = {
  requestChallenge: () => Promise<VerifyChallenge>;
  createPaymentTx: (input: {
    from: string;
    to: string;
    amount: string;
    memoHex?: string;
  }) => Promise<any>;
  signSingle: (tx: any, seed: string) => { blob: string; hash: string };
  submitSignedBlob: (blob: string) => Promise<{ txHash: string }>;
  confirmVerify: (txHash: string) => Promise<void>;
};

const encodeMemoHex = (memo: string) => {
  if (!memo) return "";
  const bytes = new TextEncoder().encode(memo);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

export const autoVerifyWalletOwnership = async (
  input: AutoVerifyInput,
  deps: AutoVerifyDeps
) => {
  const walletAddress = input.walletAddress.trim();
  const secret = input.secret.trim();
  if (!walletAddress) {
    throw new Error("アドレスが取得できません");
  }
  if (!secret) {
    throw new Error("シークレットを入力してください");
  }

  const challenge = input.challenge ?? (await deps.requestChallenge());
  const memoHex = encodeMemoHex(challenge.challenge ?? "");
  const tx = await deps.createPaymentTx({
    from: walletAddress,
    to: challenge.address,
    amount: challenge.amountDrops ?? "1",
    memoHex
  });
  const signed = deps.signSingle(tx, secret);
  const result = await deps.submitSignedBlob(signed.blob);
  await deps.confirmVerify(result.txHash);
  return { txHash: result.txHash, challenge };
};
