import { apiFetch } from "../../features/shared/lib/api";

export type SignerListSummary = {
  status: "NOT_READY" | "SET" | "FAILED";
  quorum: number | null;
  error?: string | null;
  signaturesCount: number;
  requiredCount: number;
  signedByMe: boolean;
};

export type ApprovalTxSummary = {
  memo: string | null;
  txJson: Record<string, any> | null;
  status: string | null;
  systemSignedHash?: string | null;
};

export const getSignerList = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list`, { method: "GET" });
  return result.data as SignerListSummary;
};

export const getApprovalTx = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list/approval-tx`, {
    method: "GET"
  });
  return result.data as ApprovalTxSummary;
};

export const submitSignerSignature = async (caseId: string, signedBlob: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list/sign`, {
    method: "POST",
    body: JSON.stringify({ signedBlob })
  });
  return result.data as {
    signaturesCount: number;
    requiredCount: number;
    signedByMe: boolean;
  };
};
