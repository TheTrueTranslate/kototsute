import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("plansPage.module", () => {
  it("keeps nft rows stacked vertically", () => {
    const cssPath = fileURLToPath(new URL("./plansPage.module.css", import.meta.url));
    const css = readFileSync(cssPath, "utf8");
    const nftRowBlock = css.split(".nftRow")[1] ?? "";
    expect(nftRowBlock).toContain("flex-col");
    expect(nftRowBlock).not.toContain("md:flex-row");
  });
});
