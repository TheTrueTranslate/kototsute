import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useParams: () => ({ caseId: "case-1" }) };
});

vi.mock("../../features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { uid: "heir_1" }, loading: false })
}));

const getDeathClaimMock = vi.fn(async () => ({
  claim: null,
  files: [],
  confirmationsCount: 0,
  requiredCount: 0,
  confirmedByMe: false
}));

vi.mock("../api/death-claims", () => ({
  getDeathClaim: getDeathClaimMock,
  submitDeathClaim: async () => ({ claimId: "claim-1" }),
  createDeathClaimUploadRequest: async () => ({
    requestId: "req-1",
    uploadPath: "cases/case-1/death-claims/claim-1/req-1"
  }),
  finalizeDeathClaimFile: async () => ({ fileId: "file-1" }),
  confirmDeathClaim: async () => ({ confirmationsCount: 0, requiredCount: 0 }),
  resubmitDeathClaim: async () => ({})
}));

const render = async (props: Record<string, any> = {}) => {
  const { default: DeathClaimsPage } = await import("./DeathClaimsPage");
  return renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(DeathClaimsPage, props)
    )
  );
};

describe("DeathClaimsPage", () => {
  it("renders page title", async () => {
    const html = await render();
    expect(html).toContain("死亡診断書");
  });

  it("renders rejected state with resubmit action", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "ADMIN_REJECTED",
          submittedByUid: "heir_1",
          adminReview: { status: "REJECTED", note: "差し戻し理由" }
        },
        files: [],
        confirmationsCount: 0,
        requiredCount: 0,
        confirmedByMe: false
      },
      initialLoading: false
    });
    expect(html).toContain("差し戻し");
    expect(html).toContain("再提出");
  });

  it("shows resubmit dialog when requested", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "ADMIN_REJECTED",
          submittedByUid: "heir_1",
          adminReview: { status: "REJECTED", note: "差し戻し理由" }
        },
        files: [],
        confirmationsCount: 0,
        requiredCount: 0,
        confirmedByMe: false
      },
      initialLoading: false,
      initialResubmitDialogOpen: true
    });
    expect(html).toContain("再提出の確認");
    expect(html).toContain("再提出する");
  });

  it("shows confirm dialog with death confirmation description", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "ADMIN_APPROVED",
          submittedByUid: "heir_1"
        },
        files: [],
        confirmationsCount: 0,
        requiredCount: 1,
        confirmedByMe: false
      },
      initialLoading: false,
      initialConfirmDialogOpen: true
    });
    expect(html).toContain("同意の確認");
    expect(html).toContain("死亡確定への同意");
    expect(html).toContain("相続の実行はこの操作では行われません");
  });

  it("shows confirmed message instead of waiting for other heirs", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "CONFIRMED",
          submittedByUid: "heir_1"
        },
        files: [],
        confirmationsCount: 1,
        requiredCount: 1,
        confirmedByMe: true
      },
      initialLoading: false
    });
    expect(html).toContain("死亡確定済みです。");
    expect(html).not.toContain("ほかの相続人の同意を待っています");
  });

  it("shows upload action only in file section when rejected", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "ADMIN_REJECTED",
          submittedByUid: "heir_1",
          adminReview: { status: "REJECTED", note: "差し戻し理由" }
        },
        files: [],
        confirmationsCount: 0,
        requiredCount: 0,
        confirmedByMe: false
      },
      initialLoading: false
    });
    expect(html).not.toContain('data-testid="death-claims-action-upload"');
    expect(html).toContain('data-testid="death-claims-files-upload"');
  });

  it("hides upload actions in both sections while admin review is pending", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "SUBMITTED",
          submittedByUid: "heir_1"
        },
        files: [],
        confirmationsCount: 0,
        requiredCount: 1,
        confirmedByMe: false
      },
      initialLoading: false
    });
    expect(html).not.toContain('data-testid="death-claims-action-upload"');
    expect(html).not.toContain('data-testid="death-claims-files-upload"');
    expect(html).not.toContain("現在のアクション");
    expect(html).not.toContain("運営の確認を待っています。");
    expect(html).toContain(
      "差し戻し時のみファイルを追加できます。運営確認中は追加できません。"
    );
  });

  it("shows open button for submitted files", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "SUBMITTED",
          submittedByUid: "heir_1"
        },
        files: [
          {
            fileId: "file-1",
            fileName: "death.pdf",
            contentType: "application/pdf",
            size: 1024
          }
        ],
        confirmationsCount: 0,
        requiredCount: 0,
        confirmedByMe: false
      },
      initialLoading: false
    });
    expect(html).toContain('data-testid="death-claims-file-open-file-1"');
  });

  it("renders submitted files panel before application status panel", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "SUBMITTED",
          submittedByUid: "heir_1"
        },
        files: [
          {
            fileId: "file-1",
            fileName: "death.pdf",
            contentType: "application/pdf",
            size: 1024
          }
        ],
        confirmationsCount: 0,
        requiredCount: 1,
        confirmedByMe: false
      },
      initialLoading: false
    });
    const filesIndex = html.indexOf("提出ファイル");
    const statusIndex = html.indexOf("申請ステータス");
    expect(filesIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(filesIndex).toBeLessThan(statusIndex);
  });

  it("does not render current action summary section", async () => {
    const html = await render({
      initialClaim: {
        claim: {
          claimId: "claim-1",
          status: "ADMIN_REJECTED",
          submittedByUid: "heir_1",
          adminReview: { status: "REJECTED", note: "差し戻し理由" }
        },
        files: [],
        confirmationsCount: 0,
        requiredCount: 0,
        confirmedByMe: false
      },
      initialLoading: false
    });
    expect(html).not.toContain("現在のアクション");
    expect(html).not.toContain("panelHeaderSpaced");
  });

  it("uses default mock for empty state", async () => {
    const api = await import("../api/death-claims");
    vi.mocked(api.getDeathClaim).mockResolvedValueOnce({
      claim: {
        claimId: "claim-1",
        status: "SUBMITTED",
        submittedByUid: "heir_1"
      },
      files: [],
      confirmationsCount: 0,
      requiredCount: 0,
      confirmedByMe: false
    } as any);
    const html = await render();
    expect(html).toContain("死亡診断書");
  });
});
