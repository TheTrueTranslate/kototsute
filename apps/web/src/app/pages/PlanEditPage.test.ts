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
});
