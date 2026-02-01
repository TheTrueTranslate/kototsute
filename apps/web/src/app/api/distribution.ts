import { apiFetch } from "../../features/shared/lib/api";

export type DistributionStatus =
  | "PENDING"
  | "RUNNING"
  | "PARTIAL"
  | "COMPLETED"
  | "FAILED";

export type DistributionState = {
  status: DistributionStatus;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  escalationCount: number;
  retryLimit?: number | null;
  startedAt?: string | null;
  lastProcessedAt?: string | null;
  updatedAt?: string | null;
};

export const getDistributionState = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/distribution`, { method: "GET" });
  return result.data as DistributionState;
};

export const executeDistribution = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/distribution/execute`, {
    method: "POST"
  });
  return result.data as DistributionState;
};
