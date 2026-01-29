import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ caseId: "case-1" })
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
  listAssets: async () => []
}));

vi.mock("../api/plans", () => ({
  listPlans: async () => []
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
  });
});
