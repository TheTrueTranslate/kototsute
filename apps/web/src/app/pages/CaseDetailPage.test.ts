import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ caseId: "case-1" }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()]
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

vi.mock("../api/invites", () => ({
  listInvitesByOwner: async () => [],
  listCaseHeirs: async () => [],
  createInvite: async () => ({ inviteId: "invite-1" })
}));

vi.mock("../../features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { uid: "owner" }, loading: false })
}));

const render = async () => {
  const { default: CaseDetailPage } = await import("./CaseDetailPage");
  return renderToString(
    React.createElement(MemoryRouter, null, React.createElement(CaseDetailPage))
  );
};

describe("CaseDetailPage", () => {
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
});
