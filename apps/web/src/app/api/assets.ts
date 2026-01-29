import { apiFetch } from "../../features/shared/lib/api";

export type AssetListItem = {
  assetId: string;
  label: string;
  address: string;
  createdAt: string;
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED";
};

export type AssetCreateResponse = {
  assetId: string;
  label: string;
  address: string;
};

export type AssetSyncLog = {
  id: string;
  status: "ok" | "error";
  balanceXrp: string | null;
  ledgerIndex: number | null;
  message: string | null;
  createdAt: string;
};

export type AssetDetail = {
  assetId: string;
  label: string;
  address: string;
  createdAt: string;
  updatedAt: string;
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED";
  verificationChallenge: string | null;
  verificationAddress: string;
  xrpl:
    | {
        status: "ok";
        balanceXrp: string;
        ledgerIndex?: number;
        tokens?: Array<{ currency: string; issuer: string | null; isNative: boolean }>;
      }
    | { status: "error"; message: string }
    | null;
  syncLogs: AssetSyncLog[];
};

export const createAsset = async (caseId: string, input: { label: string; address: string }) => {
  const result = await apiFetch(`/v1/cases/${caseId}/assets`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as AssetCreateResponse;
};

export const listAssets = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/assets`, { method: "GET" });
  return result.data as AssetListItem[];
};

export const getAsset = async (
  caseId: string,
  assetId: string,
  options?: { includeXrpl?: boolean }
) => {
  const query = options?.includeXrpl ? "?includeXrpl=true" : "";
  const result = await apiFetch(`/v1/cases/${caseId}/assets/${assetId}${query}`, { method: "GET" });
  return result.data as AssetDetail;
};

export const deleteAsset = async (caseId: string, assetId: string) => {
  await apiFetch(`/v1/cases/${caseId}/assets/${assetId}`, { method: "DELETE" });
};

export const requestVerifyChallenge = async (caseId: string, assetId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/assets/${assetId}/verify/challenge`, {
    method: "POST"
  });
  return result.data as { challenge: string; address: string; amountDrops: string };
};

export const confirmVerify = async (caseId: string, assetId: string, txHash: string) => {
  await apiFetch(`/v1/cases/${caseId}/assets/${assetId}/verify/confirm`, {
    method: "POST",
    body: JSON.stringify({ txHash })
  });
};
