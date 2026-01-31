import { describe, expect, it } from "vitest";
import { INTERNAL_PACKAGE } from "./index.js";

describe("internal", () => {
  it("exports sentinel", () => {
    expect(INTERNAL_PACKAGE).toBe("internal");
  });
});
