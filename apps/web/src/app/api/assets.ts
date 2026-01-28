import { apiFetch } from "../../lib/api";

export type AssetListItem = {
  assetId: string;
  label: string;
  address: string;
  createdAt: string;
};

export type AssetCreateResponse = {
  assetId: string;
  label: string;
  address: string;
};

export const createAsset = async (input: { label: string; address: string }) => {
  const result = await apiFetch("/v1/assets", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as AssetCreateResponse;
};

export const listAssets = async () => {
  const result = await apiFetch("/v1/assets", { method: "GET" });
  return result.data as AssetListItem[];
};
