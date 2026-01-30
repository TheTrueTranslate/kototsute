import { apiFetch } from "../../features/shared/lib/api";

export type HeirWallet = {
  address: string | null;
  verificationStatus: string | null;
  verificationIssuedAt?: string | null;
  verificationVerifiedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export const getHeirWallet = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/heir-wallet`, { method: "GET" });
  return result.data as HeirWallet;
};

export const saveHeirWallet = async (caseId: string, address: string) => {
  await apiFetch(`/v1/cases/${caseId}/heir-wallet`, {
    method: "POST",
    body: JSON.stringify({ address })
  });
};

export const requestHeirWalletVerifyChallenge = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/heir-wallet/verify/challenge`, {
    method: "POST"
  });
  return result.data as { challenge: string; address: string; amountDrops: string };
};

export const confirmHeirWalletVerify = async (caseId: string, txHash: string) => {
  await apiFetch(`/v1/cases/${caseId}/heir-wallet/verify/confirm`, {
    method: "POST",
    body: JSON.stringify({ txHash })
  });
};
