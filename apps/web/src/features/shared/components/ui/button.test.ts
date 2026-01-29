import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it("outlineDestructive は赤系のアウトラインスタイルになる", () => {
    const className = buttonVariants({ variant: "outlineDestructive" as any });
    expect(className).toContain("border-destructive");
    expect(className).toContain("text-destructive");
    expect(className).toContain("bg-background");
  });
});
