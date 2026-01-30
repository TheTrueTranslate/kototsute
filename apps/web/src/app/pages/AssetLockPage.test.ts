import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { AssetLockState } from "../api/asset-lock";

it("renders asset lock wizard", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(AssetLockPage))
  );
  expect(html).toContain("資産ロック");
});

it("shows tx input per asset item", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const lock: AssetLockState = {
    status: "READY",
    method: "A",
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
