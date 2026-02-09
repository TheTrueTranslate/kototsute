import { apiFetch } from "../../features/shared/lib/api";

export type SignerEntrySummary = {
  account: string;
  weight: number;
};

export type SignerListSummary = {
  status: "NOT_READY" | "SET" | "FAILED";
  quorum: number | null;
  error?: string | null;
  entries?: SignerEntrySummary[];
  systemSignerAddress?: string | null;
  signaturesCount: number;
  requiredCount: number;
  signedByMe: boolean;
};

export type ApprovalTxSummary = {
  memo: string | null;
  txJson: Record<string, any> | null;
  status: string | null;
  systemSignedHash?: string | null;
  submittedTxHash?: string | null;
  networkStatus?: "PENDING" | "VALIDATED" | "FAILED" | "NOT_FOUND" | "EXPIRED" | null;
  networkResult?: string | null;
};

export type PrepareApprovalTxSummary = {
  memo: string;
  fromAddress: string;
  destination: string;
  amountDrops: string;
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

export const prepareApprovalTx = async (
  caseId: string,
  options?: { force?: boolean }
) => {
  const body = options?.force ? JSON.stringify({ force: true }) : undefined;
  const result = await apiFetch(`/v1/cases/${caseId}/signer-list/prepare`, {
    method: "POST",
    body
  });
  return result.data as PrepareApprovalTxSummary;
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
    submittedTxHash?: string | null;
  };
};
