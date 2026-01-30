export const sendXrpPayment = async (_input: {
  fromSeed: string;
  to: string;
  amountDrops: string;
}) => {
  return { txHash: "" };
};

export const sendTokenPayment = async (_input: {
  fromSeed: string;
  to: string;
  token: { currency: string; issuer: string | null; isNative: boolean };
  amount: string;
}) => {
  return { txHash: "" };
};
