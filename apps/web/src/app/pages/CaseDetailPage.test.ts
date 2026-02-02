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
let distributionStateData = {
  status: "PENDING",
  totalCount: 0,
  successCount: 0,
  failedCount: 0,
  skippedCount: 0,
  escalationCount: 0
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
  listPlans: async () => []
}));

vi.mock("../api/tasks", () => ({
  getTaskProgress: async () => ({
    userCompletedTaskIds: []
  }),
  updateMyTaskProgress: async () => {}
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
  listInvitesByOwner: async () => [],
  listCaseHeirs: async () => caseHeirsData,
  createInvite: async () => ({ inviteId: "invite-1" })
}));

vi.mock("../api/distribution", () => ({
  getDistributionState: async () => distributionStateData,
  executeDistribution: async () => distributionStateData
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
    distributionStateData = {
      status: "PENDING",
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      escalationCount: 0
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
    expect(html).toContain("タスク");
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

  it("shows inheritance tab label for heir", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams();

    const html = await render({ initialIsOwner: false });
    expect(html).toContain("相続実行");
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
    expect(result?.title).toBe("運営承認済み");
  });

  it("renders next action banner in inheritance tab", async () => {
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
      },
      initialDeathClaim: {
        claim: { claimId: "claim-1", status: "ADMIN_APPROVED", submittedByUid: "heir" },
        confirmedByMe: false,
        confirmationsCount: 0,
        requiredCount: 1,
        files: []
      }
    });
    expect(html).toContain("次のアクション");
    expect(html).toContain("運営承認済み");
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
    expect(html).toContain("署名の流れ");
    expect(html).toContain("MultiSignのしくみ（アドレス）");
  });

  it("shows distribution section in inheritance tab", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
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

  it("hides manual sign button in consent section", async () => {
    authUser = { uid: "heir" };
    searchParams = new URLSearchParams("tab=death-claims");

    const html = await render({
      initialIsOwner: false,
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
    expect(html).toContain("署名を送信");
  });

  it("formats signer from label as legacy wallet", async () => {
    const { resolveSignerFromLabel } = await import("./CaseDetailPage");
    expect(resolveSignerFromLabel("山田")).toBe("送金元：被相続人の相続用ウォレット");
    expect(resolveSignerFromLabel("")).toBe("送金元：被相続人の相続用ウォレット");
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

  it("allows task updates after asset lock", async () => {
    const { canUpdateTaskProgress } = await import("./CaseDetailPage");
    expect(canUpdateTaskProgress({ isLocked: true })).toBe(true);
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
    ).toBe("成功 2 / 5 件");
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
    expect(reason).toBe("分配は完了しています。");
  });

  it("builds signer entry display list with roles", async () => {
    const { buildSignerEntryDisplayList } = await import("./CaseDetailPage");
    const result = buildSignerEntryDisplayList({
      entries: [
        { account: "rSystem", weight: 2 },
        { account: "rOther", weight: 1 },
        { account: "rMe", weight: 1 }
      ],
      systemSignerAddress: "rSystem",
      heirWalletAddress: "rMe"
    });
    expect(result[0].label).toBe("システム署名者");
    expect(result[1].label).toBe("あなたの受取用ウォレット");
    expect(result[2].label).toBe("相続人の受取用ウォレット");
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
    expect(html).toContain("Amount (drops)");
    expect(html).toContain("Amount (XRP)");
    expect(html).toContain("Memo");
  });

});
