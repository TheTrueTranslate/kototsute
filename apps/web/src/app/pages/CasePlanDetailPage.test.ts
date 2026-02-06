import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let caseData = {
  caseId: "case-1",
  ownerUid: "owner",
  ownerDisplayName: "山田",
  stage: "DRAFT",
  assetLockStatus: "UNLOCKED",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01"
};
let planAssets: any[] = [];

vi.mock("../api/cases", () => ({
  getCase: async () => caseData
}));

vi.mock("../api/plans", () => ({
  getPlan: async () => ({
    planId: "plan-1",
    title: "指図プラン",
    ownerUid: "owner",
    sharedAt: null,
    updatedAt: "2024-01-02"
  }),
  listPlanAssets: async () => planAssets,
  listPlanHistory: async () => [],
  deletePlan: async () => {}
}));

vi.mock("../api/invites", () => ({
  listCaseHeirs: async () => []
}));

vi.mock("../../features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { uid: "owner" }, loading: false })
}));

const render = async (props?: Record<string, unknown>, initialEntry = "/cases/case-1/plans/plan-1") => {
  const { default: CasePlanDetailPage } = await import("./CasePlanDetailPage");
  return renderToString(
    React.createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/cases/:caseId/plans/:planId",
          element: React.createElement(CasePlanDetailPage, props ?? {})
        })
      )
    )
  );
};

describe("CasePlanDetailPage", () => {
  it("renders plan title", async () => {
    const html = await render();
    expect(html).toContain("指図詳細");
  });

  it("uses tab query parameter as initial tab", async () => {
    const html = await render(undefined, "/cases/case-1/plans/plan-1?tab=history");
    expect(html).toMatch(/<button[^>]*aria-selected="true"[^>]*>\s*履歴\s*<\/button>/);
  });

  it("shows delete action for owner", async () => {
    planAssets = [];
    const html = await render({ initialCaseData: caseData });
    expect(html).toContain("指図を削除");
  });

  it("hides edit button when locked", async () => {
    caseData = { ...caseData, stage: "WAITING", assetLockStatus: "LOCKED" };
    planAssets = [];
    const html = await render({ initialCaseData: caseData });
    expect(html).not.toContain("編集する");
    expect(html).not.toContain("指図を削除");
  });

  it("resolvePlanHeirs filters only plan-added heirs in plan order", async () => {
    const { resolvePlanHeirs } = await import("./CasePlanDetailPage");
    const heirs = resolvePlanHeirs(
      {
        planId: "plan-1",
        title: "指図プラン",
        ownerUid: "owner",
        sharedAt: null,
        updatedAt: "2024-01-02",
        heirUids: ["heir-2", "heir-1"],
        heirs: []
      },
      [
        {
          inviteId: "invite-1",
          email: "heir1@example.com",
          relationLabel: "長男",
          relationOther: null,
          acceptedByUid: "heir-1",
          acceptedAt: "2024-01-01"
        },
        {
          inviteId: "invite-2",
          email: "heir2@example.com",
          relationLabel: "長女",
          relationOther: null,
          acceptedByUid: "heir-2",
          acceptedAt: "2024-01-02"
        },
        {
          inviteId: "invite-3",
          email: "heir3@example.com",
          relationLabel: "次男",
          relationOther: null,
          acceptedByUid: "heir-3",
          acceptedAt: "2024-01-03"
        }
      ]
    );
    expect(heirs.map((item) => item.acceptedByUid)).toEqual(["heir-2", "heir-1"]);
  });

  it("resolvePlanHeirs falls back to plan.heirs when case heirs are missing", async () => {
    const { resolvePlanHeirs } = await import("./CasePlanDetailPage");
    const heirs = resolvePlanHeirs(
      {
        planId: "plan-1",
        title: "指図プラン",
        ownerUid: "owner",
        sharedAt: null,
        updatedAt: "2024-01-02",
        heirUids: ["heir-1"],
        heirs: [
          {
            uid: "heir-1",
            email: "heir1@example.com",
            relationLabel: "長男",
            relationOther: null
          }
        ]
      },
      []
    );
    expect(heirs).toHaveLength(1);
    expect(heirs[0]?.acceptedByUid).toBe("heir-1");
    expect(heirs[0]?.email).toBe("heir1@example.com");
  });
});
