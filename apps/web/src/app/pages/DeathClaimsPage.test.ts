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
