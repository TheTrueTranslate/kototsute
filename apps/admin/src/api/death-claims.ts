import { apiFetch } from "../lib/api";

export type AdminDeathClaim = {
  caseId: string;
  claimId: string;
  submittedByUid: string;
  createdAt?: string;
};

export type AdminDeathClaimDetail = {
  claim: { claimId: string; status: string; submittedByUid: string };
  case: {
    caseId: string;
    ownerDisplayName: string | null;
    stage: string | null;
    assetLockStatus: string | null;
    memberCount: number;
    createdAt: string | null;
  } | null;
  files: Array<{
    fileId: string;
    fileName: string;
    contentType: string;
    size: number;
    storagePath?: string;
    uploadedByUid?: string;
    createdAt?: string;
    downloadUrl?: string | null;
  }>;
};

export const listPendingDeathClaims = async () => {
  const result = await apiFetch("/v1/admin/death-claims?status=SUBMITTED", { method: "GET" });
  return result.data as AdminDeathClaim[];
};

export const getDeathClaimDetail = async (caseId: string, claimId: string) => {
  const result = await apiFetch(`/v1/admin/death-claims/${caseId}/${claimId}`, { method: "GET" });
  return result.data as AdminDeathClaimDetail;
};

export const approveDeathClaim = async (caseId: string, claimId: string) => {
  await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/admin-approve`, { method: "POST" });
};

export const rejectDeathClaim = async (
  caseId: string,
  claimId: string,
  input: { note?: string | null }
) => {
  await apiFetch(`/v1/cases/${caseId}/death-claims/${claimId}/admin-reject`, {
    method: "POST",
    body: JSON.stringify({ note: input.note ?? null })
  });
};
