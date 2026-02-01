import { apiFetch } from "../../features/shared/lib/api";

export type SignerListSummary = {
  status: "NOT_READY" | "SET" | "FAILED";
  quorum: number | null;
  error?: string | null;
  signaturesCount: number;
  requiredCount: number;
  signedByMe: boolean;
};

export const getSignerList = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list`, { method: "GET" });
  return result.data as SignerListSummary;
};

export const submitSignerSignature = async (caseId: string, txHash: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list/sign`, {
    method: "POST",
    body: JSON.stringify({ txHash })
  });
  return result.data as {
    signaturesCount: number;
    requiredCount: number;
    signedByMe: boolean;
  };
};
