import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

it("renders asset lock wizard", async () => {
  const { default: AssetLockPage } = await import("./AssetLockPage");
  const html = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(AssetLockPage))
  );
  expect(html).toContain("資産ロック");
});
