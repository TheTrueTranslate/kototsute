import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const render = async () => {
  const { default: PlanNewPage } = await import("./PlanNewPage");
  return renderToString(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/cases/case-1/plans/new"] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/cases/:caseId/plans/new",
          element: React.createElement(PlanNewPage)
        })
      )
    )
  );
};

describe("PlanNewPage", () => {
  it("renders plan form", async () => {
    const html = await render();
    expect(html).toContain("指図作成");
  });

  it("uses API returned planId when available", async () => {
    const { resolveCreatedPlanId } = await import("./PlanNewPage");
    const planId = resolveCreatedPlanId({
      createdPlan: { planId: "plan-created", title: "作成済み指図" },
      requestedTitle: "指図A",
      plans: [
        {
          planId: "plan-1",
          title: "指図A",
          sharedAt: null,
          updatedAt: "2024-01-01T00:00:00.000Z"
        }
      ]
    });
    expect(planId).toBe("plan-created");
  });

  it("selects latest matching title when response has no planId", async () => {
    const { resolveCreatedPlanId } = await import("./PlanNewPage");
    const planId = resolveCreatedPlanId({
      createdPlan: { planId: "", title: "指図A" },
      requestedTitle: "指図A",
      plans: [
        {
          planId: "plan-old",
          title: "指図A",
          sharedAt: null,
          updatedAt: "2024-01-01T00:00:00.000Z"
        },
        {
          planId: "plan-new",
          title: "指図A",
          sharedAt: null,
          updatedAt: "2024-02-01T00:00:00.000Z"
        }
      ]
    });
    expect(planId).toBe("plan-new");
  });

  it("falls back to latest plan when no title match", async () => {
    const { resolveCreatedPlanId } = await import("./PlanNewPage");
    const planId = resolveCreatedPlanId({
      createdPlan: { planId: "", title: "未一致タイトル" },
      requestedTitle: "未一致タイトル",
      plans: [
        {
          planId: "plan-old",
          title: "指図A",
          sharedAt: null,
          updatedAt: "2024-01-01T00:00:00.000Z"
        },
        {
          planId: "plan-new",
          title: "指図B",
          sharedAt: null,
          updatedAt: "2024-02-01T00:00:00.000Z"
        }
      ]
    });
    expect(planId).toBe("plan-new");
  });
});
