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

it("shows back button with outline style on later steps", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, { initialStep: 1 })
    )
  );
  expect(html).toContain("戻る");
  expect(html).toContain("border-input");
  expect(html).toContain('data-variant="back"');
});

it("shows plan previews and confirm button for owner", async () => {
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
            status: "DRAFT",
            sharedAt: null,
            updatedAt: "2024-01-01"
          },
          {
            planId: "plan-2",
            title: "分配プランB",
            status: "DRAFT",
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
  expect(html).toContain("確認しました");
});

it("disables confirm when no active plans", async () => {
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
  expect(html).toMatch(/<button[^>]*\sdisabled(=|>)[^>]*>確認しました/);
});

it("disables start when a plan has no heirs", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, {
        initialIsOwner: true,
        initialStep: 1,
        initialPlans: [
          {
            planId: "plan-1",
            title: "指図A",
            status: "DRAFT",
            sharedAt: null,
            updatedAt: "2024-01-01"
          }
        ],
        initialPlanHeirs: { "plan-1": [] }
      })
    )
  );
  expect(html).toContain("相続人が未設定の指図があります");
  expect(html).toMatch(/<button[^>]*\sdisabled(=|>)[^>]*>ロックを開始/);
});

it("shows tx input per asset item", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
    uiStep: 3,
    methodStep: null,
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
        initialMethod: "A"
      })
    )
  );
  expect(html).toContain("TX Hash");
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

it("shows transfer type labels for XRP and token", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
    uiStep: 3,
    methodStep: null,
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
        initialMethod: "A"
      })
    )
  );
  expect(html).toContain("XRP送金");
  expect(html).toContain("トークン送金");
});

it("shows manual and automatic transfer hint", async () => {
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
  expect(html).toContain("方式Aは手動送金");
  expect(html).toContain("方式Bは自動送金");
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
  expect(html).toContain("自動送金を実行すると戻れません");
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

it("shows empty state when no transfer items", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
    uiStep: 3,
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
        initialStep: 2,
        initialMethod: "A"
      })
    )
  );
  expect(html).toContain("送金対象がありません");
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

it("shows return action when method step is AUTO_TRANSFER", async () => {
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
  expect(html).toContain("RegularKeyに戻る");
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
  expect(html).toContain("送金検証の結果");
  expect(html).toContain("Test Wallet");
  expect(html).toContain("確認済み");
  expect(html).toContain("資産ロックが完了しました");
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

it("shows method details with recommendation and ordered options", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AssetLockPage, { initialStep: 1, initialMethod: "A" })
    )
  );
  const methodAIndex = html.indexOf("方式A");
  const methodBIndex = html.indexOf("方式B");
  expect(methodAIndex).toBeGreaterThan(-1);
  expect(methodBIndex).toBeGreaterThan(-1);
  expect(methodAIndex).toBeLessThan(methodBIndex);
  expect(html).toContain("おすすめ");
  expect(html).toContain("送金後にTX Hashを入力して検証します");
});

it("prefers lock state method when provided", async () => {
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
        initialStep: 1,
        initialMethod: "B"
      })
    )
  );
  const checkedIndex = html.indexOf("checked");
  const methodAIndex = html.indexOf("方式A");
  const methodBIndex = html.indexOf("方式B");
  expect(checkedIndex).toBeGreaterThan(-1);
  expect(methodAIndex).toBeGreaterThan(-1);
  expect(methodBIndex).toBeGreaterThan(-1);
  expect(checkedIndex).toBeLessThan(methodAIndex);
  expect(checkedIndex).toBeLessThan(methodBIndex);
});
