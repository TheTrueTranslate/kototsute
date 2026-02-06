import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Button } from "./ui/button";
import { FileList } from "./file-list";

describe("FileList", () => {
  it("renders file rows with meta and custom actions", () => {
    const html = renderToString(
      React.createElement(FileList, {
        items: [
          {
            id: "file-1",
            name: "death.pdf",
            meta: "application/pdf / 1.0 KB",
            action: React.createElement(
              Button,
              { type: "button", "data-testid": "file-open-file-1" },
              "開く"
            )
          }
        ],
        emptyMessage: "提出済みのファイルはありません。"
      })
    );
    expect(html).toContain("death.pdf");
    expect(html).toContain("application/pdf / 1.0 KB");
    expect(html).toContain('data-testid="file-open-file-1"');
  });

  it("renders empty message when no items are provided", () => {
    const html = renderToString(
      React.createElement(FileList, {
        items: [],
        emptyMessage: "提出済みのファイルはありません。"
      })
    );
    expect(html).toContain("提出済みのファイルはありません。");
  });
});
