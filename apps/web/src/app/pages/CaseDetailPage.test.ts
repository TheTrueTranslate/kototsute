import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

let authUser = { uid: "owner" };
let searchParams = new URLSearchParams();
let heirWalletData: { address: string | null; verificationStatus: string | null } = {
  address: null,
  verificationStatus: null
};
let caseHeirsData: Array<any> = [];

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ caseId: "case-1" }),
    useSearchParams: () => [searchParams, vi.fn()]
  };
});

vi.mock("../api/cases", () => ({
  getCase: async () => ({
    caseId: "case-1",
    ownerUid: "owner",
    ownerDisplayName: "山田",
    stage: "DRAFT",
    assetLockStatus: "UNLOCKED",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01"
  })
}));

vi.mock("../api/assets", () => ({
  listAssets: async () => [
    {
      assetId: "asset-1",
      label: "XRP Wallet",
      address: "rXXXX",
      createdAt: "2024-01-01",
      verificationStatus: "UNVERIFIED"
    }
  ]
}));

vi.mock("../api/plans", () => ({
  listPlans: async () => []
}));

vi.mock("../api/tasks", () => ({
  getTaskProgress: async () => ({
    userCompletedTaskIds: []
  }),
  updateMyTaskProgress: async () => {}
}));

vi.mock("../api/heir-wallets", () => ({
  getHeirWallet: async () => heirWalletData,
  saveHeirWallet: async () => {},
  requestHeirWalletVerifyChallenge: async () => ({
    challenge: "challenge",
    address: "rVerify",
    amountDrops: "1"
  }),
  confirmHeirWalletVerify: async () => {}
}));

vi.mock("../api/invites", () => ({
  listInvitesByOwner: async () => [],
  listCaseHeirs: async () => caseHeirsData,
  createInvite: async () => ({ inviteId: "invite-1" })
}));

vi.mock("../../features/auth/auth-provider", () => ({
  useAuth: () => ({ user: authUser, loading: false })
}));

const render = async (props: Record<string, any> = {}) => {
  const { default: CaseDetailPage } = await import("./CaseDetailPage");
  return renderToString(
    React.createElement(MemoryRouter, null, React.createElement(CaseDetailPage, props))
  );
};

describe("CaseDetailPage", () => {
  beforeEach(() => {
    authUser = { uid: "owner" };
    searchParams = new URLSearchParams();
    heirWalletData = { address: null, verificationStatus: null };
    caseHeirsData = [];
  });

  it("shows case detail header", async () => {
    const html = await render();
    expect(html).toContain("ケース詳細");
  });

  it("renders tabs with tablist role", async () => {
    const html = await render();
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain("タスク");
  });

  it("links to asset detail page", async () => {
    const { AssetRow } = await import("./CaseDetailPage");
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AssetRow, {
          caseId: "case-1",
          asset: {
            assetId: "asset-1",
            label: "XRP Wallet",
            address: "rXXXX",
            createdAt: "2024-01-01",
            verificationStatus: "UNVERIFIED"
          }
        })
      )
    );
    expect(html).toContain("/cases/case-1/assets/asset-1");
    expect(html).toContain("XRP Wallet");
  });

  it("does not show shared tasks section", async () => {
    const html = await render();
    expect(html).not.toContain("共有タスク");
  });

  it("shows wallet registration required for heir without wallet", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=tasks");
    heirWalletData = { address: null, verificationStatus: null };

    const html = await render({ initialIsOwner: false, initialHeirWallet: heirWalletData });
    expect(html).toContain("ウォレット登録が必要です");
  });

  it("shows wallet verification required for heir with unverified wallet", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=tasks");
    heirWalletData = { address: "rHeir", verificationStatus: "PENDING" };

    const html = await render({ initialIsOwner: false, initialHeirWallet: heirWalletData });
    expect(html).toContain("所有確認が必要です");
  });

  it("does not show wallet notice when heir wallet is verified", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=tasks");
    heirWalletData = { address: "rHeir", verificationStatus: "VERIFIED" };

    const html = await render({ initialIsOwner: false, initialHeirWallet: heirWalletData });
    expect(html).not.toContain("ウォレット登録が必要です");
    expect(html).not.toContain("所有確認が必要です");
  });

  it("shows wallet tab for heir", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams();

    const html = await render({ initialIsOwner: false });
    expect(html).toContain("受取用ウォレット");
  });

  it("shows wallet status badge in heirs tab", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=heirs");
    caseHeirsData = [
      {
        inviteId: "invite-1",
        email: "heir1@example.com",
        relationLabel: "長男",
        relationOther: null,
        acceptedByUid: "heir_1",
        acceptedAt: "2024-01-02",
        walletStatus: "PENDING"
      }
    ];

    const html = await render({
      initialIsOwner: false,
      initialHeirs: caseHeirsData,
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "DRAFT",
        assetLockStatus: "UNLOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("未確認");
  });

  it("shows wallet action buttons in wallet tab", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=wallet");

    const html = await render({ initialIsOwner: false });
    expect(html).toContain("登録/変更");
    expect(html).toContain("所有確認");
  });

});
