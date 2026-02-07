import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

let caseData = {
  caseId: "case-1",
  ownerUid: "owner",
  ownerDisplayName: "山田",
  stage: "DRAFT",
  assetLockStatus: "UNLOCKED",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01"
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ caseId: "case-1", assetId: "asset-1" }),
    useNavigate: () => vi.fn()
  };
});

vi.mock("../api/cases", () => ({
  getCase: async () => caseData
}));

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
    reserveNfts: ["00090000AABBCC"],
    xrpl: {
      status: "ok",
      balanceXrp: "10",
      ledgerIndex: 100,
      tokens: [
        {
          currency: "USD",
          issuer: "rIssuer",
          balance: "5"
        }
      ],
      nfts: [
        {
          tokenId: "00090000AABBCC",
          issuer: "rIssuer",
          uri: "https://example.com/nft/1"
        }
      ],
      syncedAt: "2024-01-03T00:00:00.000Z"
    },
    syncLogs: []
  }),
  getAssetHistory: async () => [],
  requestVerifyChallenge: async () => ({
    challenge: "abc",
    address: "rVerify",
    amountDrops: "1"
  }),
  confirmVerify: async () => ({}),
  deleteAsset: async () => ({})
}));

vi.mock("../../features/shared/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogClose: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children)
}));

const defaultInitialAsset = {
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
  reserveNfts: ["00090000AABBCC"],
  xrpl: {
    status: "ok",
    balanceXrp: "10",
    ledgerIndex: 100,
    tokens: [
      {
        currency: "USD",
        issuer: "rIssuer",
        balance: "5"
      }
    ],
    nfts: [
      {
        tokenId: "00090000AABBCC",
        issuer: "rIssuer",
        uri: "https://example.com/nft/1"
      }
    ],
    syncedAt: "2024-01-03T00:00:00.000Z"
  },
  syncLogs: []
};

const render = async (props?: Record<string, unknown>) => {
  const { default: AssetDetailPage } = await import("./AssetDetailPage");
  return renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetDetailPage as any, {
        initialAsset: defaultInitialAsset,
        ...(props ?? {})
      })
    )
  );
};

describe("AssetDetailPage", () => {
  it("closes verify dialog when verification is completed", async () => {
    const { shouldCloseVerifyDialogOnSuccess } = await import("./AssetDetailPage");
    expect(shouldCloseVerifyDialogOnSuccess("VERIFIED")).toBe(true);
    expect(shouldCloseVerifyDialogOnSuccess("PENDING")).toBe(false);
  });

  it("highlights verify action only when unverified and unlocked", async () => {
    const { shouldHighlightVerifyOwnership } = await import("./AssetDetailPage");
    expect(shouldHighlightVerifyOwnership("UNVERIFIED", false)).toBe(true);
    expect(shouldHighlightVerifyOwnership("PENDING", false)).toBe(true);
    expect(shouldHighlightVerifyOwnership("VERIFIED", false)).toBe(false);
    expect(shouldHighlightVerifyOwnership("UNVERIFIED", true)).toBe(false);
  });

  it("hides edit actions when locked", async () => {
    caseData = { ...caseData, stage: "WAITING", assetLockStatus: "LOCKED" };
    const html = await render({
      initialCaseData: caseData
    });
    expect(html).toContain("留保設定を保存");
    expect(html).not.toContain("資産を削除");
  });

  it("renders asset detail", async () => {
    const html = await render();
    expect(html).toContain("XRP Wallet");
    expect(html).toContain("rXXXX");
  });

  it("renders asset name edit controls", async () => {
    const html = await render();
    expect(html).toContain("資産名");
    expect(html).toContain("資産名を更新");
  });

  it("shows combined inheritance and reserve section", async () => {
    const html = await render();
    expect(html).toContain("相続予定数・留保設定");
  });

  it("shows nft reserve section", async () => {
    const html = await render();
    expect(html).toContain("NFT");
  });

  it("renders history tab", async () => {
    const html = await render();
    expect(html).toContain("履歴");
  });

  it("shows wallet info and inheritance section", async () => {
    const html = await render();
    expect(html).toContain("ウォレット情報");
    expect(html).toContain("相続予定数");
  });

  it("shows none in inheritance section when token and nft are empty", async () => {
    const html = await render({
      initialAsset: {
        ...defaultInitialAsset,
        reserveNfts: [],
        xrpl: {
          ...defaultInitialAsset.xrpl,
          tokens: [],
          nfts: []
        }
      }
    });
    const inheritanceIndex = html.indexOf("相続予定数");
    expect(inheritanceIndex).toBeGreaterThan(-1);

    const inheritanceHtml = html.slice(inheritanceIndex);
    expect(inheritanceHtml).toContain("トークン");
    expect(inheritanceHtml).toContain("NFT");
    expect(inheritanceHtml).not.toContain("残高 0 / 留保 0");
    expect((inheritanceHtml.match(/なし/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("moves sync action and wallet address into wallet section", async () => {
    const html = await render();
    const headerMatch = html.match(/<header class="[^"]*">([\s\S]*?)<\/header>/);
    const headerHtml = headerMatch?.[1] ?? "";
    expect(headerHtml).not.toContain("最新の情報を同期");
    expect(headerHtml).not.toContain("rXXXX");

    const walletIndex = html.indexOf("ウォレット情報");
    expect(walletIndex).toBeGreaterThan(-1);
    const htmlAfterWallet = html.slice(walletIndex);
    expect(htmlAfterWallet).toContain("最新の情報を同期");
    expect(htmlAfterWallet).toContain("rXXXX");
  });

  it("shows actor in history items", async () => {
    const html = await render({
      initialTab: "history",
      initialHistoryItems: [
        {
          historyId: "history-1",
          type: "ASSET_CREATED",
          title: "資産を登録しました",
          detail: "登録済み",
          actorUid: "owner_1",
          actorEmail: "owner@example.com",
          createdAt: "2024-01-04T00:00:00.000Z",
          meta: null
        }
      ]
    });
    expect(html).toContain("担当者");
    expect(html).toContain("owner@example.com");
  });

  it("localizes asset history summary by type instead of raw stored title", async () => {
    const html = await render({
      initialTab: "history",
      initialHistoryItems: [
        {
          historyId: "history-2",
          type: "ASSET_SYNCED",
          title: "RAW_ASSET_HISTORY_TITLE",
          detail: "残高 10 XRP",
          actorUid: "owner_1",
          actorEmail: "owner@example.com",
          createdAt: "2024-01-04T00:00:00.000Z",
          meta: null
        }
      ]
    });
    expect(html).toContain("ウォレット情報を同期");
    expect(html).not.toContain("RAW_ASSET_HISTORY_TITLE");
  });

  it("renders auto verify guidance without tx hash input", async () => {
    const html = await render();
    expect(html).toContain("data-testid=\"wallet-verify-panel\"");
    expect(html).toContain("シークレットで自動検証");
    expect(html).toContain("Destination（運営確認用ウォレット）");
    expect(html).toContain("システムの検証用アドレス");
    expect(html).toContain("1 drops (=0.000001 XRP)");
    expect(html).not.toContain("TX Hash");
    expect(html).not.toContain("Destinationをコピー");
    expect(html).not.toContain("Memoをコピー");
  });
});
