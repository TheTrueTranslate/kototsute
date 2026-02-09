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

export type DistributionItem = {
  itemId: string;
  type?: string | null;
  tokenId?: string | null;
  offerId?: string | null;
  heirUid?: string | null;
  heirAddress?: string | null;
  status?: string | null;
  txHash?: string | null;
  receiveStatus?: string | null;
  receiveTxHash?: string | null;
  receiveError?: string | null;
  error?: string | null;
};

export const listDistributionItems = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/distribution/items`, { method: "GET" });
  return result.data as DistributionItem[];
};

export const recordDistributionReceiveTx = async (
  caseId: string,
  itemId: string,
  txHash: string
) => {
  const result = await apiFetch(`/v1/cases/${caseId}/distribution/items/${itemId}/receive`, {
    method: "POST",
    body: JSON.stringify({ txHash })
  });
  return result.data as {
    itemId: string;
    receiveTxHash: string;
    receiveStatus: string;
    receivedAt?: string | null;
  };
};
