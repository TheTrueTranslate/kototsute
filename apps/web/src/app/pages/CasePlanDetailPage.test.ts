import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../api/plans", () => ({
  getPlan: async () => ({
    planId: "plan-1",
    title: "共有プラン",
    status: "SHARED",
    ownerUid: "owner",
    sharedAt: "2024-01-01",
    updatedAt: "2024-01-02"
  }),
  listPlanAssets: async () => [],
  listPlanHistory: async () => []
}));

vi.mock("../api/invites", () => ({
  listCaseHeirs: async () => []
}));

vi.mock("../../features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { uid: "owner" }, loading: false })
}));

const render = async () => {
  const { default: CasePlanDetailPage } = await import("./CasePlanDetailPage");
  return renderToString(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/cases/case-1/plans/plan-1"] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/cases/:caseId/plans/:planId",
          element: React.createElement(CasePlanDetailPage)
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
});
