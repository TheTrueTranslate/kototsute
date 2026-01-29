import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const render = async () => {
  const { default: AssetNewPage } = await import("./AssetNewPage");
  return renderToString(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/cases/case-1/assets/new"] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/cases/:caseId/assets/new",
          element: React.createElement(AssetNewPage)
        })
      )
    )
  );
};

describe("AssetNewPage", () => {
  it("renders asset form", async () => {
    const html = await render();
    expect(html).toContain("資産登録");
  });
});
