import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { buildAssetDetailPath, navigateToCreatedAssetDetail } from "./AssetNewPage";

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
  it("builds asset detail path after create", () => {
    expect(buildAssetDetailPath("case-1", "asset-1")).toBe("/cases/case-1/assets/asset-1");
  });

  it("navigates to created asset detail path after create", () => {
    const navigate = vi.fn();
    navigateToCreatedAssetDetail(navigate, "case-1", "asset-1");
    expect(navigate).toHaveBeenCalledWith("/cases/case-1/assets/asset-1");
  });

  it("renders asset form", async () => {
    const html = await render();
    expect(html).toContain("資産登録");
  });

  it("renders simplified XRPL wallet focused screen", async () => {
    const html = await render();
    expect(html).toContain("ラベル");
    expect(html).toContain("XRPLアドレス");
    expect(html).not.toContain("追加対象");
    expect(html).not.toContain("XRPLウォレット");
    expect(html).not.toContain("XRPLウォレットアドレスを登録します");
    expect(html).not.toContain("ステーブルコイン");
    expect(html).not.toContain("不動産");
    expect(html).not.toContain("株式");
    expect(html).not.toContain("社債");
    expect(html).not.toContain("会員権");
    expect(html).not.toContain("デジタル資産");
  });
});
