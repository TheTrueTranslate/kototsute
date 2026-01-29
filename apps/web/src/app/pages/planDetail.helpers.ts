import type { AssetListItem } from "../api/assets";
import type { InviteListItem } from "../api/invites";
import type { PlanAsset, PlanHeir } from "../api/plans";

export const filterAvailableHeirs = (
  invites: InviteListItem[],
  planHeirs: PlanHeir[]
): InviteListItem[] => {
  const existing = new Set(planHeirs.map((heir) => heir.uid));
  return invites.filter(
    (invite) =>
      invite.status === "accepted" &&
      typeof invite.acceptedByUid === "string" &&
      invite.acceptedByUid.length > 0 &&
      !existing.has(invite.acceptedByUid)
  );
};

export const filterAvailableAssets = (
  assets: AssetListItem[],
  planAssets: PlanAsset[]
): AssetListItem[] => {
  const existing = new Set(planAssets.map((asset) => asset.assetId));
  return assets.filter((asset) => !existing.has(asset.assetId));
};
