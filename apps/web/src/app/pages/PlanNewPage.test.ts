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
});
