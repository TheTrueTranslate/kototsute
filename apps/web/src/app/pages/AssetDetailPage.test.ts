import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ caseId: "case-1", assetId: "asset-1" }),
    useNavigate: () => vi.fn()
  };
});

vi.mock("../api/assets", () => ({
  getAsset: async () => ({
    assetId: "asset-1",
    label: "XRP Wallet",
    address: "rXXXX",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-02",
    verificationStatus: "UNVERIFIED",
    verificationChallenge: null,
    verificationAddress: "rVerify",
    reserveXrp: "0",
    reserveTokens: [],
    xrpl: null,
    syncLogs: []
  }),
  requestVerifyChallenge: async () => ({
    challenge: "abc",
    address: "rVerify",
    amountDrops: "1"
  }),
  confirmVerify: async () => ({}),
  deleteAsset: async () => ({})
}));

const render = async () => {
  const { default: AssetDetailPage } = await import("./AssetDetailPage");
  return renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetDetailPage, {
        initialAsset: {
          assetId: "asset-1",
          label: "XRP Wallet",
          address: "rXXXX",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-02",
          verificationStatus: "UNVERIFIED",
          verificationChallenge: null,
          verificationAddress: "rVerify",
          reserveXrp: "0",
          reserveTokens: [],
          xrpl: null,
          syncLogs: []
        }
      })
    )
  );
};

describe("AssetDetailPage", () => {
  it("renders asset detail", async () => {
    const html = await render();
    expect(html).toContain("XRP Wallet");
    expect(html).toContain("rXXXX");
  });

  it("shows reserve section", async () => {
    const html = await render();
    expect(html).toContain("留保設定");
  });
});
