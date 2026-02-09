import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { AssetLockState } from "../api/asset-lock";
import type { PlanHeir, PlanAsset } from "../api/plans";

vi.mock("../../features/auth/auth-provider", () => ({
  useAuth: () => ({ user: { uid: "owner_1" }, loading: false })
}));

it("renders asset lock wizard", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(AssetLockPage))
  );
  expect(html).toContain("資産ロック");
});

it("uses formal service title", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(AssetLockPage))
  );
  expect(html).toContain("資産ロック手続き");
  expect(html).not.toContain("資産ロックウィザード");
});

it("shows step label in header", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(AssetLockPage))
  );
  expect(html).toContain("STEP");
});

it("does not show navigation buttons on the first step", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(AssetLockPage))
  );
  expect(html).not.toContain("戻る");
  expect(html).not.toContain("次へ");
});

it("does not show back button on later steps", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, { initialStep: 1 })
    )
  );
  expect(html).not.toContain("戻る");
  expect(html).not.toContain('data-variant="back"');
});

it("shows plan previews and start button for owner", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const heirs: PlanHeir[] = [
    { uid: "heir-1", email: "a@example.com", relationLabel: "長男", relationOther: null },
    { uid: "heir-2", email: "b@example.com", relationLabel: "次男", relationOther: null }
  ];
  const planAssets: PlanAsset[] = [
    {
      planAssetId: "pa-1",
      assetId: "asset-1",
      assetType: "XRPL",
      assetLabel: "Testnet Wallet",
      assetAddress: "rTest",
      token: null,
      unitType: "PERCENT",
      allocations: [
        { heirUid: "heir-1", value: 60 },
        { heirUid: "heir-2", value: 40 }
      ]
    }
  ];
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialIsOwner: true,
        initialPlans: [
          {
            planId: "plan-1",
            title: "分配プランA",
            sharedAt: null,
            updatedAt: "2024-01-01"
          },
          {
            planId: "plan-2",
            title: "分配プランB",
            sharedAt: null,
            updatedAt: "2024-01-02"
          }
        ],
        initialPlanHeirs: {
          "plan-1": heirs,
          "plan-2": heirs
        },
        initialPlanAssets: {
          "plan-1": planAssets,
          "plan-2": planAssets
        }
      })
    )
  );
  expect(html).toContain("指図プレビュー");
  expect(html).toContain("分配プランA");
  expect(html).toContain("分配プランB");
  expect(html).toContain("分配ルール");
  expect(html).toContain("長男");
  expect(html).toContain("60%");
  expect(html).toContain("ロックを開始");
});

it("shows token and nft allocations in plan preview", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const heirs: PlanHeir[] = [
    { uid: "heir-1", email: "a@example.com", relationLabel: "長男", relationOther: null },
    { uid: "heir-2", email: "b@example.com", relationLabel: "次男", relationOther: null }
  ];
  const planAssets: PlanAsset[] = [
    {
      planAssetId: "pa-1",
      assetId: "asset-1",
      assetType: "XRPL",
      assetLabel: "Testnet Wallet",
      assetAddress: "rTest",
      token: { currency: "USD", issuer: "rIssuer", isNative: false },
      unitType: "PERCENT",
      allocations: [
        { heirUid: "heir-1", value: 70 },
        { heirUid: "heir-2", value: 30 }
      ],
      nfts: [
        { tokenId: "nft-1", issuer: "rIssuer", uri: null },
        { tokenId: "nft-2", issuer: "rIssuer", uri: null }
      ],
      nftAllocations: [{ tokenId: "nft-1", heirUid: "heir-1" }]
    }
  ];
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialIsOwner: true,
        initialPlans: [
          {
            planId: "plan-1",
            title: "分配プランA",
            sharedAt: null,
            updatedAt: "2024-01-01"
          }
        ],
        initialPlanHeirs: { "plan-1": heirs },
        initialPlanAssets: { "plan-1": planAssets }
      })
    )
  );
  expect(html).toContain("トークン割当");
  expect(html).toContain("USD");
  expect(html).toContain("rIssuer");
  expect(html).toContain("NFT割当");
  expect(html).toContain("nft-1");
  expect(html).toContain("nft-2");
  expect(html).toContain("未割当");
});

it("disables start when no active plans", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialIsOwner: true,
        initialPlans: []
      })
    )
  );
  expect(html).toContain("相続対象の指図がありません");
  expect(html.indexOf("相続対象の指図がありません")).toBeLessThan(html.indexOf("準備・注意"));
  expect(html).toMatch(/<button[^>]*\sdisabled(=|>)[^>]*>ロックを開始/);
});

it("disables start when a plan has no heirs", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialIsOwner: true,
        initialStep: 0,
        initialPlans: [
          {
            planId: "plan-1",
            title: "指図A",
            sharedAt: null,
            updatedAt: "2024-01-01"
          }
        ],
        initialPlanHeirs: { "plan-1": [] }
      })
    )
  );
  expect(html).toContain("相続人が未設定の指図があります");
  expect(html.indexOf("相続人が未設定の指図があります")).toBeLessThan(html.indexOf("準備・注意"));
  expect(html).toMatch(/<button[^>]*\sdisabled(=|>)[^>]*>ロックを開始/);
});

it("shows method progress instead of tx input on transfer step", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "XRP",
        token: null,
        plannedAmount: "1",
        status: "PENDING",
        txHash: null,
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("RegularKeyを設定");
  expect(html).not.toContain("TX Hash");
});

it("shows balances on verify step", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
    uiStep: 4,
    methodStep: null,
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Wallet",
        token: null,
        plannedAmount: "1",
        status: "VERIFIED",
        txHash: "tx",
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialBalances: {
          destination: { address: "rDest", balanceXrp: "20", status: "ok", message: null },
          sources: [{ assetId: "a1", address: "rFrom", balanceXrp: "10", status: "ok", message: null }]
        }
      })
    )
  );
  expect(html).toContain("送金先");
  expect(html).toContain("20 XRP");
  expect(html).toContain("送金元");
  expect(html).toContain("10 XRP");
  expect(html).toContain("再取得");
  expect(html).toContain("反映に時間がかかる");
  expect(html).toContain("https://testnet.xrpl.org/accounts/rDest");
});

it("shows inheritance wallet address confirmation with activation status", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: {
      address: "rDest",
      activationStatus: "PENDING",
      activationMessage: "Account not found."
    },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("相続用ウォレット");
  expect(html).toContain("rDest");
  expect(html).toContain('href="https://testnet.xrpl.org/accounts/rDest"');
  expect(html).toContain('data-xrpl-explorer-link="true"');
  expect(html).toContain("未アクティベート");
  expect(html).toContain("Account not found.");
});

it("shows pending message when account is not found", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
    uiStep: 4,
    methodStep: null,
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialBalances: {
          destination: {
            address: "rDest",
            balanceXrp: null,
            status: "error",
            message: "Account not found."
          },
          sources: []
        }
      })
    )
  );
  expect(html).toContain("反映待ち");
});

it("does not render manual transfer labels in method B flow", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "XRP",
        token: null,
        plannedAmount: "1",
        status: "PENDING",
        txHash: null,
        error: null
      },
      {
        itemId: "i2",
        assetId: "a1",
        assetLabel: "JPYC",
        token: { currency: "JPYC", issuer: "rIssuer", isNative: false },
        plannedAmount: "5",
        status: "PENDING",
        txHash: null,
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).not.toContain("XRP送金");
  expect(html).not.toContain("トークン送金");
});

it("shows method B transfer hint", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("方式Bは自動送金");
  expect(html).not.toContain("方式Aは手動送金");
});

it("shows auto transfer warning dialog when opened", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "AUTO_TRANSFER",
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B",
        initialAutoTransferConfirmOpen: true
      })
    )
  );
  expect(html).not.toContain("自動送金を実行すると戻れません");
});

it("shows regular key verification statuses", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: { address: "rDest" },
    items: [],
    regularKeyStatuses: [
      {
        assetId: "asset-1",
        assetLabel: "Test Wallet",
        address: "rFrom",
        status: "UNVERIFIED",
        message: "RegularKeyが一致しません"
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("RegularKeyの確認結果");
  expect(html).toContain("未確認");
  expect(html).toContain("RegularKeyが一致しません");
  expect(html.indexOf("RegularKeyの確認結果")).toBeLessThan(html.indexOf("方式Bは自動送金"));
});

it("hides back button after auto transfer completes", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 4,
    methodStep: "TRANSFER_DONE",
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "B"
      })
    )
  );
  expect(html).not.toContain("戻る");
});

it("shows method progress when no transfer items", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("RegularKeyを設定");
  expect(html).not.toContain("送金対象がありません");
});

it("shows method B progress steps", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "AUTO_TRANSFER",
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("RegularKey");
  expect(html).toContain("自動送金");
});

it("does not show return action when method step is AUTO_TRANSFER", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "AUTO_TRANSFER",
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).not.toContain("RegularKeyに戻る");
  expect(html).toContain("自動送金を実行");
});

it("shows verification results on the final step", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "LOCKED",
    method: "A",
    uiStep: 4,
    methodStep: null,
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Test Wallet",
        token: null,
        plannedAmount: "1",
        status: "VERIFIED",
        txHash: "ABC",
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "A"
      })
    )
  );
  expect(html).toContain("送金完了");
  expect(html).not.toContain("送金完了の結果");
  expect(html).toContain("Test Wallet");
  expect(html).toContain("確認済み");
  expect(html).toContain('href="https://testnet.xrpl.org/transactions/ABC"');
  expect(html).toContain(">ABC</a>");
  expect(html).not.toContain(">https://testnet.xrpl.org/transactions/ABC</a>");
  expect(html).toContain("資産ロックが完了しました");
  expect(html).not.toContain("ケース詳細に戻ります");
});

it("does not auto-show verify section after RegularKey clear in method B", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_CLEARED",
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Test Wallet",
        token: null,
        plannedAmount: "1",
        status: "VERIFIED",
        txHash: "ABC",
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "B",
        initialBalances: {
          destination: { address: "rDest", balanceXrp: "20", status: "ok", message: null },
          sources: [{ assetId: "a1", address: "rFrom", balanceXrp: "10", status: "ok", message: null }]
        }
      })
    )
  );
  expect(html).toContain("方式Bは自動送金");
  expect(html).not.toContain("送金先");
  expect(html).not.toContain("20 XRP");
  expect(html).toContain("次に進む");
  expect(html).not.toContain("進行中");
  expect(html).toContain("STEP");
  expect(html).toContain("2 / 3");
});

it("keeps STEP 3/3 after continue when method step is REGULAR_KEY_CLEARED", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 4,
    methodStep: "REGULAR_KEY_CLEARED",
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Test Wallet",
        token: null,
        plannedAmount: "1",
        status: "VERIFIED",
        txHash: "ABC",
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "B",
        initialBalances: {
          destination: { address: "rDest", balanceXrp: "20", status: "ok", message: null },
          sources: [{ assetId: "a1", address: "rFrom", balanceXrp: "10", status: "ok", message: null }]
        }
      })
    )
  );
  expect(html).toContain("3 / 3");
  expect(html).toContain("送金先");
  expect(html).not.toContain("方式Bは自動送金");
  expect(html).not.toContain("次に進む");
});

it("renders verify section on STEP 3/3 in method B when uiStep is verify", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 4,
    methodStep: "TRANSFER_DONE",
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Test Wallet",
        token: null,
        plannedAmount: "1",
        status: "VERIFIED",
        txHash: "ABC",
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "B",
        initialBalances: {
          destination: { address: "rDest", balanceXrp: "20", status: "ok", message: null },
          sources: [{ assetId: "a1", address: "rFrom", balanceXrp: "10", status: "ok", message: null }]
        }
      })
    )
  );
  expect(html).toContain("3 / 3");
  expect(html).toContain("送金先");
  expect(html).not.toContain("方式Bは自動送金");
});

it("shows tx hash used for auto transfer with explorer link", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_CLEARED",
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Test Wallet",
        token: null,
        plannedAmount: "1",
        status: "VERIFIED",
        txHash: "ABC",
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("送金に利用したTx Hash");
  expect(html.indexOf("送金に利用したTx Hash")).toBeLessThan(html.indexOf("方式Bは自動送金"));
  expect(html).toContain('href="https://testnet.xrpl.org/transactions/ABC"');
  expect(html).toContain(">ABC</a>");
});

it("shows regular key results and tx hashes in a single summary card", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_CLEARED",
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Test Wallet",
        token: null,
        plannedAmount: "1",
        status: "VERIFIED",
        txHash: "ABC",
        error: null
      }
    ],
    regularKeyStatuses: [
      {
        assetId: "asset-1",
        assetLabel: "Test Wallet",
        address: "rFrom",
        status: "VERIFIED",
        message: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "B"
      })
    )
  );
  const walletIndex = html.indexOf("相続用ウォレット");
  const regularKeyIndex = html.indexOf("RegularKeyの確認結果");
  const txHashIndex = html.indexOf("送金に利用したTx Hash");
  expect(walletIndex).toBeGreaterThanOrEqual(0);
  expect(regularKeyIndex).toBeGreaterThan(walletIndex);
  expect(txHashIndex).toBeGreaterThan(regularKeyIndex);
  expect(html).toContain("RegularKeyの確認結果");
  expect(html).toContain("送金に利用したTx Hash");
  expect((html.match(/walletCheckCard/g) ?? []).length).toBe(1);
  expect((html.match(/regularKeyStatusCard/g) ?? []).length).toBe(0);
});

it("shows complete action when all items are verified", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
    uiStep: 4,
    methodStep: null,
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Test Wallet",
        token: null,
        plannedAmount: "1",
        status: "VERIFIED",
        txHash: "ABC",
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "A"
      })
    )
  );
  expect(html).toContain("完了する");
  expect(html).not.toMatch(/<button[^>]*\sdisabled(=|>)[^>]*>完了する/);
});

it("disables complete action when items are not verified", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
    uiStep: 4,
    methodStep: null,
    wallet: { address: "rDest" },
    items: [
      {
        itemId: "i1",
        assetId: "a1",
        assetLabel: "Test Wallet",
        token: null,
        plannedAmount: "1",
        status: "PENDING",
        txHash: null,
        error: null
      }
    ]
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 3,
        initialMethod: "A"
      })
    )
  );
  expect(html).toContain("完了する");
  expect(html).toMatch(/<button[^>]*\sdisabled(=|>)[^>]*>完了する/);
  expect(html).toContain("検証待ちの送金が1件あります。再取得で最新状態を確認してください。");
});

it("shows regular key signing action when method step is REGULAR_KEY_SET", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("確認する");
});

it("shows regular key status as unverified before verification", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "B",
    uiStep: 3,
    methodStep: "REGULAR_KEY_SET",
    wallet: { address: "rDest" },
    items: [],
    regularKeyStatuses: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 2,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("確認状況");
  expect(html).toContain("未確認");
  expect(html).toContain("確認する");
});

it("does not show method selection step after merging STEP1 and STEP2", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, { initialStep: 0, initialMethod: "B" })
    )
  );
  expect(html).toContain("準備・注意");
  expect(html).toContain("被相続人の確認待ちです。");
  expect(html).not.toContain("方式選択");
});

it("does not render method cards after STEP merge", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, { initialStep: 0, initialMethod: "B" })
    )
  );
  expect(html).not.toContain("方式A");
  expect(html).not.toContain("方式B");
  expect(html).not.toContain("おすすめ");
});

it("does not render method radio inputs even when lock state method is A", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
    wallet: { address: "rDest" },
    items: []
  };
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialLock: lock,
        initialStep: 0,
        initialMethod: "B"
      })
    )
  );
  expect(html).toContain("準備・注意");
  expect(html).not.toContain("方式A");
  expect(html).not.toContain('name="asset-lock-method"');
});
