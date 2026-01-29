import { apiFetch } from "../../features/shared/lib/api";

export type CaseStage = "DRAFT" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
export type CaseAssetLockStatus = "UNLOCKED" | "LOCKED";

export type CaseSummary = {
  caseId: string;
  ownerUid: string;
  ownerDisplayName: string;
  stage: CaseStage;
  assetLockStatus: CaseAssetLockStatus;
  createdAt: string;
  updatedAt: string;
};

export type CaseListResponse = {
  created: CaseSummary[];
  received: CaseSummary[];
};

export const createCase = async (input: { ownerDisplayName: string }) => {
  const result = await apiFetch("/v1/cases", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as CaseSummary;
};

export const listCases = async () => {
  const result = await apiFetch("/v1/cases", { method: "GET" });
  return result.data as CaseListResponse;
};

export const getCase = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}`, { method: "GET" });
  return result.data as CaseSummary;
};
