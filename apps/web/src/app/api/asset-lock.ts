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
  uiStep: number | null;
  methodStep: string | null;
  wallet: {
    address: string;
    activationStatus?: "ACTIVATED" | "PENDING" | "ERROR" | null;
    activationCheckedAt?: string | null;
    activationMessage?: string | null;
  } | null;
  items: AssetLockItem[];
  regularKeyStatuses?: {
    assetId: string;
    assetLabel: string;
    address: string;
    status: "VERIFIED" | "UNVERIFIED" | "ERROR";
    message: string | null;
  }[];
};

export type AssetLockBalanceEntry = {
  assetId?: string;
  assetLabel?: string;
  address: string;
  status: "ok" | "error";
  balanceXrp: string | null;
  message: string | null;
};

export type AssetLockBalances = {
  destination: AssetLockBalanceEntry;
  sources: AssetLockBalanceEntry[];
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

export const verifyAssetLockRegularKey = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/regular-key/verify`, {
    method: "POST"
  });
  return result.data as AssetLockState;
};

export const updateAssetLockState = async (
  caseId: string,
  input: { uiStep?: number | null; methodStep?: string | null }
) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/state`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
  return result.data as AssetLockState;
};

export const getAssetLockBalances = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/balances`, { method: "GET" });
  return result.data as AssetLockBalances;
};

export const completeAssetLock = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/asset-lock/complete`, {
    method: "POST"
  });
  return result.data as AssetLockState;
};
