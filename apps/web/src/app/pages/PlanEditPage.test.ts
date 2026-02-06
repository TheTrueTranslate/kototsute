import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const render = async () => {
  const { default: PlanEditPage } = await import("./PlanEditPage");
  return renderToString(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/cases/case-1/plans/plan-1/edit"] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/cases/:caseId/plans/:planId/edit",
          element: React.createElement(PlanEditPage)
        })
      )
    )
  );
};

describe("PlanEditPage", () => {
  it("renders plan editor", async () => {
    const html = await render();
    expect(html).toContain("指図編集");
  });

  it("does not render sharing step", async () => {
    const html = await render();
    expect(html).not.toContain("共有");
  });

  it("renders nft allocation section", async () => {
    const html = await render();
    expect(html).toContain("NFT割当");
  });

  it("hides edit flow callout and shows updated helper texts", async () => {
    const html = await render();
    expect(html).not.toContain("編集の流れ");
    expect(html).toContain("資産を分配する相続人を追加します");
    expect(html).toContain("分配する資産を追加します");
  });

  it("builds allocation payload as percent-only", async () => {
    const { buildAllocationUpdateInput } = await import("./PlanEditPage");
    expect(
      buildAllocationUpdateInput(["heir-1", "heir-2"], {
        "heir-1": "60.5",
        "heir-2": ""
      })
    ).toEqual({
      unitType: "PERCENT",
      allocations: [
        { heirUid: "heir-1", value: 60.5 },
        { heirUid: "heir-2", value: 0 }
      ]
    });
  });

  it("generates same allocation signature for equivalent values", async () => {
    const { buildAllocationSignature, buildAllocationUpdateInput } = await import("./PlanEditPage");
    const first = buildAllocationSignature(
      buildAllocationUpdateInput(["heir-1", "heir-2"], {
        "heir-1": "10",
        "heir-2": "20.000000"
      })
    );
    const second = buildAllocationSignature(
      buildAllocationUpdateInput(["heir-1", "heir-2"], {
        "heir-1": "10.0000000",
        "heir-2": "20"
      })
    );
    expect(first).toBe(second);
  });
});
