import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./assetDetailPage.module.css", import.meta.url), "utf8");

describe("assetDetailPage styles", () => {
  it("uses stacked layout for inheritance and reserve sections", () => {
    expect(css).not.toMatch(/combinedGrid\s*\{[^}]*lg:grid-cols-2/);
  });

  it("allows long nft token ids to wrap", () => {
    expect(css).toMatch(/\.nftTokenId\s*\{[^}]*break-all/);
    expect(css).toMatch(/\.nftInfo\s*\{[^}]*min-w-0/);
  });
});
