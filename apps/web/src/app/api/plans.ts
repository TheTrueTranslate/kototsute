import { apiFetch } from "../../features/shared/lib/api";

export type PlanListItem = {
  planId: string;
  title: string;
  sharedAt: string | null;
  updatedAt: string;
  assetCount?: number;
  heirCount?: number;
};

export type PlanHeir = {
  uid: string;
  email: string;
  relationLabel: string;
  relationOther: string | null;
};

export type PlanDetail = PlanListItem & {
  ownerUid?: string | null;
  heirUids: string[];
  heirs: PlanHeir[];
};

export type PlanAllocation = {
  heirUid: string | null;
  value: number;
  isUnallocated?: boolean;
};

export type PlanToken = {
  currency: string;
  issuer: string | null;
  isNative: boolean;
};

export type PlanNft = {
  tokenId: string;
  issuer: string | null;
  uri: string | null;
};

export type PlanNftAllocation = {
  tokenId: string;
  heirUid: string | null;
};

export type PlanAsset = {
  planAssetId: string;
  assetId: string;
  assetType: string;
  assetLabel: string;
  assetAddress?: string | null;
  token: PlanToken | null;
  unitType: "PERCENT" | "AMOUNT";
  allocations: PlanAllocation[];
  nftAllocations?: PlanNftAllocation[];
  nfts?: PlanNft[];
};

export type PlanHistoryEntry = {
  historyId: string;
  type: string;
  title: string;
  detail: string | null;
  actorUid: string | null;
  actorEmail: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
};

export const createPlan = async (caseId: string, input: { title: string }) => {
  const result = await apiFetch(`/v1/cases/${caseId}/plans`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as { planId: string; title: string };
};

export const listPlans = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/plans`, { method: "GET" });
  return result.data as PlanListItem[];
};

export const getPlan = async (caseId: string, planId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/plans/${planId}`, { method: "GET" });
  return result.data as PlanDetail;
};

export const updatePlanTitle = async (caseId: string, planId: string, title: string) => {
  await apiFetch(`/v1/cases/${caseId}/plans/${planId}/title`, {
    method: "POST",
    body: JSON.stringify({ title })
  });
};

export const listPlanHistory = async (caseId: string, planId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/plans/${planId}/history`, { method: "GET" });
  return result.data as PlanHistoryEntry[];
};

export const listPlanAssets = async (caseId: string, planId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/plans/${planId}/assets`, { method: "GET" });
  return result.data as PlanAsset[];
};

export const addPlanHeir = async (caseId: string, planId: string, heirUid: string) => {
  await apiFetch(`/v1/cases/${caseId}/plans/${planId}/heirs`, {
    method: "POST",
    body: JSON.stringify({ heirUid })
  });
};

export const removePlanHeir = async (caseId: string, planId: string, heirUid: string) => {
  await apiFetch(`/v1/cases/${caseId}/plans/${planId}/heirs/${heirUid}`, { method: "DELETE" });
};

export const addPlanAsset = async (
  caseId: string,
  planId: string,
  input: { assetId: string; unitType: "PERCENT" | "AMOUNT"; token?: PlanToken | null }
) => {
  const result = await apiFetch(`/v1/cases/${caseId}/plans/${planId}/assets`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as { planAssetId: string };
};

export const deletePlanAsset = async (caseId: string, planId: string, planAssetId: string) => {
  await apiFetch(`/v1/cases/${caseId}/plans/${planId}/assets/${planAssetId}`, { method: "DELETE" });
};

export const updatePlanAllocations = async (
  caseId: string,
  planId: string,
  planAssetId: string,
  input: { unitType: "PERCENT" | "AMOUNT"; allocations: PlanAllocation[] }
) => {
  await apiFetch(`/v1/cases/${caseId}/plans/${planId}/assets/${planAssetId}/allocations`, {
    method: "POST",
    body: JSON.stringify(input)
  });
};

export const updatePlanNftAllocations = async (
  caseId: string,
  planId: string,
  planAssetId: string,
  input: { allocations: PlanNftAllocation[] }
) => {
  await apiFetch(`/v1/cases/${caseId}/plans/${planId}/assets/${planAssetId}/nfts`, {
    method: "POST",
    body: JSON.stringify(input)
  });
};

export const deletePlan = async (caseId: string, planId: string) => {
  await apiFetch(`/v1/cases/${caseId}/plans/${planId}`, { method: "DELETE" });
};
