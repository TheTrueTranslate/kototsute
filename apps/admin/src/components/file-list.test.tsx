import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { FileList } from "./file-list";

describe("admin FileList", () => {
  it("renders file rows with optional meta and action", () => {
    const html = renderToString(
      <FileList
        items={[
          {
            id: "file-1",
            name: "death.pdf",
            meta: "PDF",
            action: <button type="button">開く</button>
          }
        ]}
        emptyMessage="ファイルがありません。"
      />
    );

    expect(html).toContain("death.pdf");
    expect(html).toContain("PDF");
    expect(html).toContain(">開く<");
  });

  it("renders empty message when there are no files", () => {
    const html = renderToString(<FileList items={[]} emptyMessage="ファイルがありません。" />);
    expect(html).toContain("ファイルがありません。");
  });
});
