import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SidebarProvider } from "./sidebar";

describe("SidebarProvider", () => {
  it("uses wider width for collapsed icon mode", () => {
    const html = renderToString(
      React.createElement(SidebarProvider, null, React.createElement("div"))
    );
    expect(html).toMatch(/--sidebar-width-icon:\s*3.5rem/);
  });
});
