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
let ownerInvitesData: Array<any> = [];
let caseHeirsData: Array<any> = [];
let plansData: Array<any> = [];
let distributionStateData = {
  status: "PENDING",
  totalCount: 0,
  successCount: 0,
  failedCount: 0,
  skippedCount: 0,
  escalationCount: 0
};
let distributionItemsData: Array<any> = [];
let assetLockStateData = {
  status: "DRAFT",
  method: null,
  uiStep: null,
  methodStep: null,
  wallet: null,
  items: [],
  regularKeyStatuses: []
};
let caseData = {
  caseId: "case-1",
  ownerUid: "owner",
  ownerDisplayName: "山田",
  stage: "DRAFT",
  assetLockStatus: "UNLOCKED",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01"
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ caseId: "case-1" }),
    useSearchParams: () => [searchParams, vi.fn()]
  };
});

vi.mock("../api/cases", () => ({
  getCase: async () => caseData
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
  listPlans: async () => plansData
}));

vi.mock("../../features/shared/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    React.createElement("div", null, open ? children : null),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogClose: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children)
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
  listInvitesByOwner: async () => ownerInvitesData,
  listCaseHeirs: async () => caseHeirsData,
  createInvite: async () => ({ inviteId: "invite-1" }),
  updateInvite: async () => {}
}));

vi.mock("../api/distribution", () => ({
  getDistributionState: async () => distributionStateData,
  executeDistribution: async () => distributionStateData,
  listDistributionItems: async () => distributionItemsData
}));

vi.mock("../api/asset-lock", () => ({
  getAssetLock: async () => assetLockStateData
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
    ownerInvitesData = [];
    caseHeirsData = [];
    plansData = [];
    distributionStateData = {
      status: "PENDING",
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      escalationCount: 0
    };
    distributionItemsData = [];
    assetLockStateData = {
      status: "DRAFT",
      method: null,
      uiStep: null,
      methodStep: null,
      wallet: null,
      items: [],
      regularKeyStatuses: []
    };
    caseData = {
      caseId: "case-1",
      ownerUid: "owner",
      ownerDisplayName: "山田",
      stage: "DRAFT",
      assetLockStatus: "UNLOCKED",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01"
    };
  });

  it("shows case detail header", async () => {
    const html = await render();
    expect(html).toContain("ケース詳細");
  });

  it("renders tabs with tablist role", async () => {
    const html = await render();
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
  });

  it("shows distribution wallet for owner when inheritance is in progress", async () => {
    const html = await render({
      initialIsOwner: true,
      initialCaseData: {
        ...caseData,
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED"
      },
      initialDistributionWalletAddress: "rDistributionWallet"
    });
    expect(html).toContain("分配用ウォレットアドレス</span>");
    expect(html).toContain("rDistributionWallet");
    expect(html).toContain('href="https://testnet.xrpl.org/accounts/rDistributionWallet"');
    expect(html).toContain('data-xrpl-explorer-link="true"');
  });

  it("shows distribution wallet for owner after asset lock is completed", async () => {
    const html = await render({
      initialIsOwner: true,
      initialCaseData: {
        ...caseData,
        stage: "WAITING",
        assetLockStatus: "LOCKED"
      },
      initialDistributionWalletAddress: "rDistributionWalletAfterLock"
    });
    expect(html).toContain("分配用ウォレットアドレス</span>");
    expect(html).toContain("rDistributionWalletAfterLock");
    expect(html).toContain(
      'href="https://testnet.xrpl.org/accounts/rDistributionWalletAfterLock"'
    );
    expect(html).toContain('data-xrpl-explorer-link="true"');
  });

  it("hides edit actions when asset lock is locked", async () => {
    caseData = {
      ...caseData,
      stage: "WAITING",
      assetLockStatus: "LOCKED"
    };
    const html = await render();
    expect(html).not.toContain("資産を追加");
    expect(html).not.toContain("資産をロックする");
    expect(html).not.toContain("指図を作成");
    expect(html).not.toContain("招待を送る");
  });

  it("shows add-heir button instead of inline invite form in heirs tab", async () => {
    const html = await render({
      initialTab: "heirs",
      initialIsOwner: true,
      initialCaseData: {
        ...caseData,
        stage: "DRAFT",
        assetLockStatus: "UNLOCKED"
      }
    });
    expect(html).toContain("相続人を追加");
    expect(html).not.toContain('placeholder="example@example.com"');
  });

  it("shows edit action for each invite in heirs tab", async () => {
    const html = await render({
      initialTab: "heirs",
      initialIsOwner: true,
      initialCaseData: {
        ...caseData,
        stage: "DRAFT",
        assetLockStatus: "UNLOCKED"
      },
      initialOwnerInvites: [
        {
          inviteId: "invite-1",
          caseId: "case-1",
          ownerUid: "owner",
          email: "heir@example.com",
          status: "accepted",
          relationLabel: "長男",
          relationOther: null,
          memo: "初回メモ",
          acceptedByUid: "heir_1",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
          acceptedAt: "2024-01-02",
          declinedAt: null
        }
      ]
    });
    expect(html).toContain("編集");
    expect(html).toContain("初回メモ");
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

  it("renders verification status badges for assets", async () => {
    const { AssetRow } = await import("./CaseDetailPage");
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          React.Fragment,
          null,
          React.createElement(AssetRow, {
            caseId: "case-1",
            asset: {
              assetId: "asset-1",
              label: "XRP Wallet",
              address: "rXXXX",
              createdAt: "2024-01-01",
              verificationStatus: "VERIFIED"
            }
          }),
          React.createElement(AssetRow, {
            caseId: "case-1",
            asset: {
              assetId: "asset-2",
              label: "BTC Wallet",
              address: "1XXXX",
              createdAt: "2024-01-02",
              verificationStatus: "PENDING"
            }
          }),
          React.createElement(AssetRow, {
            caseId: "case-1",
            asset: {
              assetId: "asset-3",
              label: "ETH Wallet",
              address: "0xXXXX",
              createdAt: "2024-01-03",
              verificationStatus: "UNVERIFIED"
            }
          })
        )
      )
    );
    expect(html).toContain("検証成功");
    expect(html).toContain("検証失敗");
    expect(html).toContain("未検証");
  });

  it("shows wallet tab for heir", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams();

    const html = await render({ initialIsOwner: false });
    expect(html).toContain("受取用ウォレット");
  });

  it("shows inheritance tab label for heir", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams();

    const html = await render({ initialIsOwner: false });
    expect(html).toContain("相続実行");
  });

  it("shows asset and heir counts in plans tab", async () => {
    const html = await render({
      initialTab: "plans",
      initialIsOwner: true,
      initialCaseData: caseData,
      initialPlans: [
        {
          planId: "plan-1",
          title: "分配プランA",
          sharedAt: null,
          updatedAt: "2099-12-31",
          assetCount: 2,
          heirCount: 3
        }
      ]
    });

    expect(html).toContain("資産: 2件");
    expect(html).toContain("相続人: 3人");
    expect(html).not.toContain("2099");
  });

  it("does not fetch approval tx before inheritance starts", async () => {
    const { shouldFetchApprovalTx } = await import("./CaseDetailPage");
    const shouldFetch = shouldFetchApprovalTx({
      isHeir: true,
      tab: "death-claims",
      caseId: "case-1",
      canAccessDeathClaims: true,
      caseStage: "WAITING",
      signerStatus: "SET"
    });
    expect(shouldFetch).toBe(false);
  });

  it("fetches approval tx when inheritance is in progress", async () => {
    const { shouldFetchApprovalTx } = await import("./CaseDetailPage");
    const shouldFetch = shouldFetchApprovalTx({
      isHeir: true,
      tab: "death-claims",
      caseId: "case-1",
      canAccessDeathClaims: true,
      caseStage: "IN_PROGRESS",
      signerStatus: "SET"
    });
    expect(shouldFetch).toBe(true);
  });

  it("allows prepare when signer list is set but approval tx is missing", async () => {
    const { resolvePrepareDisabledReason } = await import("./CaseDetailPage");
    const reason = resolvePrepareDisabledReason({
      caseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      },
      signerStatusKey: "SET",
      totalHeirCount: 1,
      unverifiedHeirCount: 0,
      approvalTx: null
    });
    expect(reason).toBeNull();
  });

  it("allows prepare retry when signer list is failed", async () => {
    const { resolvePrepareDisabledReason } = await import("./CaseDetailPage");
    const reason = resolvePrepareDisabledReason({
      caseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      },
      signerStatusKey: "FAILED",
      totalHeirCount: 1,
      unverifiedHeirCount: 0,
      approvalTx: null
    });
    expect(reason).toBeNull();
  });

  it("maps account-not-found signer error to localized key", async () => {
    const { resolveSignerListErrorMessage } = await import("./CaseDetailPage");
    expect(resolveSignerListErrorMessage("Account not found.")).toEqual({
      key: "cases.detail.signer.error.accountNotFound"
    });
    expect(resolveSignerListErrorMessage("Unexpected")).toBe("Unexpected");
  });

  it("ignores approval tx not found error", async () => {
    const { resolveApprovalTxErrorMessage } = await import("./CaseDetailPage");
    const message = resolveApprovalTxErrorMessage({
      message: "ApprovalTx not found",
      data: { code: "NOT_FOUND" }
    });
    expect(message).toBeNull();
  });

  it("resolves next action for admin approved", async () => {
    const { resolveInheritanceNextAction } = await import("./CaseDetailPage");
    const result = resolveInheritanceNextAction({
      claimStatus: "ADMIN_APPROVED",
      caseStage: "WAITING",
      signerStatus: "NOT_READY",
      approvalStatus: null,
      signerCompleted: false
    });
    expect(result).not.toBeNull();
    expect(result?.stepIndex).toBe(0);
    expect(result?.titleKey).toBe("cases.detail.inheritance.steps.adminApproved.title");
    expect(result?.descriptionKey).toBe(
      "cases.detail.inheritance.steps.adminApproved.description"
    );
  });

  it("resolves heir flow step index in order", async () => {
    const { resolveHeirFlowStepIndex } = await import("./CaseDetailPage");
    expect(
      resolveHeirFlowStepIndex({
        hasHeirWallet: false,
        hasDeathClaim: false,
        hasSignature: false,
        hasReceive: false
      })
    ).toBe(0);
    expect(
      resolveHeirFlowStepIndex({
        hasHeirWallet: true,
        hasDeathClaim: false,
        hasSignature: false,
        hasReceive: false
      })
    ).toBe(1);
    expect(
      resolveHeirFlowStepIndex({
        hasHeirWallet: true,
        hasDeathClaim: true,
        hasSignature: false,
        hasReceive: false
      })
    ).toBe(2);
    expect(
      resolveHeirFlowStepIndex({
        hasHeirWallet: true,
        hasDeathClaim: true,
        hasSignature: true,
        hasReceive: false
      })
    ).toBe(3);
  });

  it("hides legacy next action banner for heir flow", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");
    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "WAITING",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      }
    });
    expect(html).not.toContain("次のアクション");
    expect(html).toContain("STEP 2/4");
    expect(html).not.toContain("相続実行の同意");
  });

  it("blocks inheritance flow until heir wallet is registered", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "WAITING",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("受取用ウォレットを登録");
    expect(html).toContain("受取用ウォレットを開く");
    expect(html).toContain("STEP 1/4");
    expect(html).toContain("受取用ウォレットの登録が完了すると、相続実行に進めます。");
    expect(html).not.toContain("相続実行の同意");
  });

  it("shows inheritance flow content after heir wallet is registered", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "WAITING",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("STEP 2/4");
    expect(html).toContain("死亡診断書");
    expect(html).not.toContain("heirStepperTrack");
    expect(html).not.toContain("2/4: 死亡診断書");
    expect(html).toContain('data-heir-flow-review-step="1"');
    expect(html).toContain('data-heir-flow-review-step="4"');
    expect(html).not.toContain("相続実行の同意");
    expect(html).not.toContain("受取用ウォレットを開く");
  });

  it("shows current death claim status text in death certificate block for heir", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "SUBMITTED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "WAITING",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("運営の確認を待っています。");
    expect(html).not.toContain("提出状況の確認・再提出");
  });

  it("shows prepare guidance when some heirs are unverified", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");
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
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("相続人の受取用ウォレットが全員分確認済みになると準備できます");
    expect(html).toContain("未確認: 1人");
  });

  it("shows prepare button when all heirs are verified", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");
    caseHeirsData = [
      {
        inviteId: "invite-1",
        email: "heir1@example.com",
        relationLabel: "長男",
        relationOther: null,
        acceptedByUid: "heir_1",
        acceptedAt: "2024-01-02",
        walletStatus: "VERIFIED"
      }
    ];

    const html = await render({
      initialIsOwner: false,
      initialHeirs: caseHeirsData,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("相続同意の準備を始める");
  });

  it("renders consent section when inheritance tab is active", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("相続実行の同意");
    expect(html).not.toContain("MultiSignのしくみ（アドレス）");
  });

  it("shows distribution section in inheritance tab", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialSignerList: {
        status: "SET",
        quorum: 1,
        signaturesCount: 1,
        requiredCount: 1,
        signedByMe: true
      },
      initialApprovalTx: {
        status: "SUBMITTED",
        txJson: {
          Account: "rSource",
          Destination: "rDestination",
          Amount: "1000"
        },
        memo: "memo",
        submittedTxHash: "tx-hash",
        networkStatus: "VALIDATED",
        networkResult: "tesSUCCESS"
      },
      initialDistribution: {
        status: "PENDING",
        totalCount: 1,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        escalationCount: 0
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("分配を実行");
  });

  it("shows distribution section and hides nft receive when receivable items are empty", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialSignerList: {
        status: "SET",
        quorum: 1,
        signaturesCount: 1,
        requiredCount: 1,
        signedByMe: true
      },
      initialApprovalTx: {
        status: "SUBMITTED",
        txJson: {
          Account: "rSource",
          Destination: "rDestination",
          Amount: "1000"
        },
        memo: "memo",
        submittedTxHash: "tx-hash",
        networkStatus: "VALIDATED",
        networkResult: "tesSUCCESS"
      },
      initialDistribution: {
        status: "PENDING",
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        escalationCount: 0
      },
      initialDistributionItems: [],
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });

    expect(html).toContain("分配を実行");
    expect(html).not.toContain("NFT受取");
  });

  it("keeps signature step when approval is submitted but not validated", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialSignerList: {
        status: "SET",
        quorum: 2,
        signaturesCount: 0,
        requiredCount: 2,
        signedByMe: false
      },
      initialApprovalTx: {
        status: "SUBMITTED",
        txJson: {
          Account: "rSource",
          Destination: "rDestination",
          Amount: "1000"
        },
        memo: "memo",
        submittedTxHash: "tx-hash",
        networkStatus: "PENDING",
        networkResult: null
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });

    expect(html).toContain("STEP 3/4");
    expect(html).not.toContain("3/4: 署名");
    expect(html).not.toContain("分配を実行");
    expect(html).toContain('href="https://testnet.xrpl.org/transactions/tx-hash"');
    expect(html).not.toContain("1分ごとに自動更新します。");
  });

  it("keeps signature step even when signer quorum is met but approval tx is not validated", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialSignerList: {
        status: "SET",
        quorum: 1,
        signaturesCount: 1,
        requiredCount: 1,
        signedByMe: true
      },
      initialApprovalTx: {
        status: "SUBMITTED",
        txJson: {
          Account: "rSource",
          Destination: "rDestination",
          Amount: "1000"
        },
        memo: "memo",
        submittedTxHash: "tx-hash",
        networkStatus: "PENDING",
        networkResult: null
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });

    expect(html).toContain("STEP 3/4");
    expect(html).not.toContain("3/4: 署名");
    expect(html).not.toContain("分配を実行");
  });

  it("hides nft receive block when receivable items are empty", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialSignerList: {
        status: "SET",
        quorum: 1,
        signaturesCount: 1,
        requiredCount: 1,
        signedByMe: true
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).not.toContain("NFT受取");
  });

  it("shows nft receive block when receivable nft items exist", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");
    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialSignerList: {
        status: "SET",
        quorum: 1,
        signaturesCount: 1,
        requiredCount: 1,
        signedByMe: true
      },
      initialApprovalTx: {
        status: "SUBMITTED",
        txJson: {
          Account: "rSource",
          Destination: "rDestination",
          Amount: "1000"
        },
        memo: "memo",
        submittedTxHash: "tx-hash",
        networkStatus: "VALIDATED",
        networkResult: "tesSUCCESS"
      },
      initialDistributionItems: [
        {
          itemId: "dist-1",
          type: "NFT",
          offerId: "offer-1",
          heirUid: "heir",
          status: "PENDING",
          tokenId: "000ABC"
        }
      ],
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).toContain("NFT受取");
  });

  it("shows only prepare action before approval tx is generated", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html).not.toContain("署名を生成");
    expect(html).toContain("相続同意の準備を始める");
    expect(html).not.toContain('placeholder="s..."');
  });

  it("renders a single signer action panel in prepared state", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "VERIFIED" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialSignerList: {
        status: "SET",
        quorum: 1,
        signaturesCount: 0,
        requiredCount: 1,
        signedByMe: false
      },
      initialApprovalTx: {
        status: "PREPARED",
        txJson: {
          Account: "rSource",
          Destination: "rDestination",
          Amount: "1000"
        },
        memo: "memo",
        submittedTxHash: null,
        networkStatus: null,
        networkResult: null
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });
    expect(html.split('data-testid="signer-action-panel"').length - 1).toBe(1);
    expect(html).toContain("署名を送信");
    expect(html).not.toContain("相続同意の準備を始める");
  });

  it("hides account and amount fields plus signer copy actions in signer details", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: { address: "rHeir", verificationStatus: "PENDING" },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      },
      initialSignerList: {
        status: "SET",
        quorum: 1,
        signaturesCount: 0,
        requiredCount: 1,
        signedByMe: false
      },
      initialApprovalTx: {
        status: "PREPARED",
        txJson: {
          Account: "rSource",
          Destination: "rDestination",
          Amount: "1000"
        },
        memo: "memo",
        submittedTxHash: null,
        networkStatus: null,
        networkResult: null
      },
      initialCaseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    });

    expect(html).not.toContain('data-testid="signer-multisign-help-button"');
    expect(html).not.toContain("送金元：被相続人の相続用ウォレット");
    expect(html).not.toContain("送金先：システムのウォレット");
    expect(html).not.toContain("Amount (drops)");
    expect(html).not.toContain("Amount (XRP)");
    expect(html).not.toContain("送信Txをコピー");
    expect(html).not.toContain("送金元をコピー");
    expect(html).not.toContain("送金先をコピー");
    expect(html).not.toContain("Memoをコピー");
  });

  it("decides whether to poll approval status", async () => {
    const { shouldPollApprovalStatus } = await import("./CaseDetailPage");
    expect(
      shouldPollApprovalStatus({
        isHeir: true,
        tab: "death-claims",
        caseId: "case-1",
        canAccessDeathClaims: true,
        caseStage: "IN_PROGRESS",
        signerStatus: "SET",
        approvalStatus: "SUBMITTED"
      })
    ).toBe(true);
    expect(
      shouldPollApprovalStatus({
        isHeir: true,
        tab: "death-claims",
        caseId: "case-1",
        canAccessDeathClaims: true,
        caseStage: "IN_PROGRESS",
        signerStatus: "SET",
        approvalStatus: "PREPARED"
      })
    ).toBe(false);
  });

  it("hides signer actions when approval is submitted", async () => {
    const { shouldShowSignerActions } = await import("./CaseDetailPage");
    expect(shouldShowSignerActions("SUBMITTED")).toBe(false);
    expect(shouldShowSignerActions("PREPARED")).toBe(true);
  });

  it("hides signer details when approval is submitted", async () => {
    const { shouldShowSignerDetails } = await import("./CaseDetailPage");
    expect(shouldShowSignerDetails("SUBMITTED")).toBe(false);
    expect(shouldShowSignerDetails("PREPARED")).toBe(true);
  });

  it("determines approval completion from network status", async () => {
    const { isApprovalCompleted } = await import("./CaseDetailPage");
    expect(
      isApprovalCompleted({
        approvalStatus: "SUBMITTED",
        networkStatus: "VALIDATED",
        networkResult: "tesSUCCESS"
      })
    ).toBe(true);
    expect(
      isApprovalCompleted({
        approvalStatus: "SUBMITTED",
        networkStatus: "FAILED",
        networkResult: "tecFAILED"
      })
    ).toBe(false);
  });

  it("formats distribution progress with success count", async () => {
    const { formatDistributionProgressText } = await import("./CaseDetailPage");
    expect(
      formatDistributionProgressText({
        status: "RUNNING",
        totalCount: 5,
        successCount: 2,
        failedCount: 1,
        skippedCount: 0,
        escalationCount: 0
      })
    ).toEqual({
      key: "cases.detail.distribution.progress",
      values: { success: 2, total: 5 }
    });
  });

  it("disables distribution when completed", async () => {
    const { resolveDistributionDisabledReason } = await import("./CaseDetailPage");
    const reason = resolveDistributionDisabledReason({
      caseData: {
        caseId: "case-1",
        ownerUid: "owner",
        ownerDisplayName: "山田",
        stage: "IN_PROGRESS",
        assetLockStatus: "LOCKED",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      },
      approvalCompleted: true,
      totalHeirCount: 1,
      unverifiedHeirCount: 0,
      distributionLoading: false,
      distribution: {
        status: "COMPLETED",
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        skippedCount: 0,
        escalationCount: 0
      }
    });
    expect(reason).toEqual({ key: "cases.detail.distribution.disabled.completed" });
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
    expect(html).not.toContain("残高確認");
    expect(html).toContain("登録/変更");
    expect(html).toContain("所有確認");
  });

  it("hides verify button when heir wallet is verified", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=wallet");
    heirWalletData = { address: "rHeir", verificationStatus: "VERIFIED" };

    const html = await render({ initialIsOwner: false, initialHeirWallet: heirWalletData });
    expect(html).not.toContain(">所有確認<");
  });

  it("hides register button when heir wallet is verified", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=wallet");
    heirWalletData = { address: "rHeir", verificationStatus: "VERIFIED" };

    const html = await render({ initialIsOwner: false, initialHeirWallet: heirWalletData });
    expect(html).not.toContain("登録/変更");
  });

  it("shows registered wallet address in wallet tab", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=wallet");
    heirWalletData = { address: "rHeir", verificationStatus: "PENDING" };

    const html = await render({ initialIsOwner: false, initialHeirWallet: heirWalletData });
    expect(html).toContain("ウォレットアドレス");
    expect(html).toContain("rHeir");
    expect(html).toContain("https://testnet.xrpl.org/accounts/rHeir");
  });

  it("shows wallet status label in wallet tab", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=wallet");
    heirWalletData = { address: "rHeir", verificationStatus: "PENDING" };

    const html = await render({ initialIsOwner: false, initialHeirWallet: heirWalletData });
    expect(html).toContain("ステータス");
    expect(html).toContain("未確認");
  });

  it("shows copyable verification fields for heir wallet", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=wallet");
    heirWalletData = { address: "rHeir", verificationStatus: "PENDING" };

    const html = await render({
      initialIsOwner: false,
      initialHeirWallet: heirWalletData,
      initialWalletDialogOpen: true,
      initialWalletDialogMode: "verify"
    });
    expect(html).toContain("Destination（運営確認用ウォレット）");
    expect(html).toContain("システムの検証用アドレス");
    expect(html).toContain("1 drops (=0.000001 XRP)");
    expect(html).not.toContain("Amount (drops)");
    expect(html).not.toContain("Amount (XRP)");
    expect(html).not.toContain("取引ハッシュ");
    expect(html).not.toContain("Destinationをコピー");
    expect(html).not.toContain("Memoをコピー");
  });

});
