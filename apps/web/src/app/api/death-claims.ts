import { apiFetch } from "../../features/shared/lib/api";

export type DeathClaimFile = {
  fileId: string;
  fileName: string;
  contentType: string;
  size: number;
  storagePath: string;
};

export type DeathClaimData = {
  claimId: string;
  status: "SUBMITTED" | "ADMIN_APPROVED" | "CONFIRMED";
  submittedByUid: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DeathClaimSummary = {
  claim: DeathClaimData | null;
  files: DeathClaimFile[];
  confirmationsCount: number;
  requiredCount: number;
  confirmedByMe: boolean;
};

export const getDeathClaim = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims`, { method: "GET" });
  return result.data as DeathClaimSummary;
};

export const submitDeathClaim = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims`, { method: "POST" });
  return result.data as { claimId: string };
};

export const createDeathClaimUploadRequest = async (
  caseId: string,
  claimId: string,
  payload: { fileName: string; contentType: string; size: number }
) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/upload-requests`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data as { requestId: string; uploadPath: string };
};

export const finalizeDeathClaimFile = async (
  caseId: string,
  claimId: string,
  requestId: string
) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/files`, {
    method: "POST",
    body: JSON.stringify({ requestId })
  });
  return result.data as { fileId: string };
};

export const confirmDeathClaim = async (caseId: string, claimId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/confirm`, {
    method: "POST"
  });
  return result.data as { confirmationsCount: number; requiredCount: number };
};
