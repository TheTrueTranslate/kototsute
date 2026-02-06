import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import ResetPage from "./ResetPage";

const render = () =>
  renderToString(React.createElement(MemoryRouter, null, React.createElement(ResetPage)));

describe("ResetPage", () => {
  it("shows logo and language switcher", () => {
    const html = render();
    expect(html).toContain('src="/logo.png"');
    expect(html).toContain("表示言語");
    expect(html).toContain("日本語");
    expect(html).toContain("English");
  });

  it("shows language hint near submit section", () => {
    const html = render();
    const hintIndex = html.indexOf("マイページでも表示言語を切り替えられます。");
    const submitIndex = html.indexOf(">再設定メールを送る<");
    expect(hintIndex).toBeGreaterThan(-1);
    expect(submitIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeLessThan(submitIndex);
  });
});
