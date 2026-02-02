import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { WalletVerifyPanel } from "./wallet-verify-panel";

vi.mock("./ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) =>
    React.createElement("button", props, children)
}));

vi.mock("./ui/input", () => ({
  Input: (props: Record<string, unknown>) => React.createElement("input", props)
}));

vi.mock("./form-field", () => ({
  default: ({ label, children }: { label: string; children: React.ReactNode }) =>
    React.createElement("label", null, label, children)
}));

describe("WalletVerifyPanel", () => {
  it("renders destination, memo, hints, and auto verify button", () => {
    const html = renderToString(
      React.createElement(WalletVerifyPanel, {
        destination: "rVerify",
        memo: "abc",
        secret: "sSecret",
        onSecretChange: () => undefined,
        onSubmit: () => undefined,
        isSubmitting: false,
        submitDisabled: false,
        secretDisabled: false
      })
    );

    expect(html).toContain("Destination（運営確認用ウォレット）");
    expect(html).toContain("送金先はシステムの検証用アドレスです");
    expect(html).toContain("1 drops (=0.000001 XRP)");
    expect(html).toContain("Memo");
    expect(html).toContain("シークレットで自動検証");
  });
});
