import { apiFetch } from "../../features/shared/lib/api";

export type AssetLockMethod = "A" | "B";

export type AssetLockItem = {
  itemId: string;
  assetId: string;
  assetLabel: string;
  token: { currency: string; issuer: string | null; isNative: boolean } | null;
  plannedAmount: string;
  status: "PENDING" | "SENT" | "VERIFIED" | "FAILED";
  txHash: string | null;
  error: string | null;
};

export type AssetLockState = {
  status: "DRAFT" | "READY" | "LOCKING" | "LOCKED" | "FAILED";
  method: AssetLockMethod | null;
  wallet: { address: string } | null;
  items: AssetLockItem[];
};

export const getAssetLock = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock`, { method: "GET" });
  return result.data as AssetLockState;
};

export const startAssetLock = async (caseId: string, input: { method: AssetLockMethod }) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/start`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as AssetLockState;
};

export const verifyAssetLockItem = async (
  caseId: string,
  input: { itemId: string; txHash: string }
) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/verify`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as AssetLockState;
};

export const executeAssetLock = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/execute`, {
    method: "POST"
  });
  return result.data as AssetLockState;
};
