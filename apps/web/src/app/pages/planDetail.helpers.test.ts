import { describe, expect, it } from "vitest";
import type { AssetListItem } from "../api/assets";
import type { InviteListItem } from "../api/invites";
import type { PlanAsset, PlanHeir } from "../api/plans";
import { filterAvailableAssets, filterAvailableHeirs } from "./planDetail.helpers";

const baseInvite = (overrides: Partial<InviteListItem>): InviteListItem => ({
  inviteId: "invite-1",
  ownerUid: "owner-1",
  ownerEmail: null,
  email: "heir@example.com",
  status: "accepted",
  relationLabel: "子",
  relationOther: null,
  memo: null,
  isExistingUserAtInvite: false,
  acceptedByUid: "heir-1",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  acceptedAt: "2024-01-01",
  declinedAt: null,
  ...overrides
});

const baseAsset = (overrides: Partial<AssetListItem>): AssetListItem => ({
  assetId: "asset-1",
  label: "資産A",
  address: "rXXXXXXXXXXXXXXXX",
  createdAt: "2024-01-01",
  verificationStatus: "VERIFIED",
  ...overrides
});

describe("filterAvailableHeirs", () => {
  it("accepted かつ未追加の相続人のみ返す", () => {
    const invites: InviteListItem[] = [
      baseInvite({ inviteId: "invite-accepted", acceptedByUid: "heir-1" }),
      baseInvite({ inviteId: "invite-pending", status: "pending", acceptedByUid: null }),
      baseInvite({ inviteId: "invite-declined", status: "declined", acceptedByUid: null }),
      baseInvite({ inviteId: "invite-no-uid", status: "accepted", acceptedByUid: null }),
      baseInvite({ inviteId: "invite-new", acceptedByUid: "heir-2", email: "new@example.com" })
    ];
    const planHeirs: PlanHeir[] = [
      { uid: "heir-1", email: "heir@example.com", relationLabel: "子", relationOther: null }
    ];

    const result = filterAvailableHeirs(invites, planHeirs);

    expect(result.map((invite) => invite.inviteId)).toEqual(["invite-new"]);
  });
});

describe("filterAvailableAssets", () => {
  it("既に指図へ追加済みの資産を除外する", () => {
    const assets: AssetListItem[] = [
      baseAsset({ assetId: "asset-1", label: "資産A" }),
      baseAsset({ assetId: "asset-2", label: "資産B" })
    ];
    const planAssets: PlanAsset[] = [
      {
        planAssetId: "plan-asset-1",
        assetId: "asset-1",
        assetType: "XRPL",
        assetLabel: "資産A",
        token: null,
        unitType: "PERCENT",
        allocations: []
      }
    ];

    const result = filterAvailableAssets(assets, planAssets);

    expect(result.map((asset) => asset.assetId)).toEqual(["asset-2"]);
  });
});
