import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import RegisterPage from "./RegisterPage";

const render = () =>
  renderToString(
    React.createElement(MemoryRouter, null, React.createElement(RegisterPage))
  );

describe("RegisterPage", () => {
  it("shows display name field", () => {
    const html = render();
    expect(html).toContain("表示名");
  });
});
