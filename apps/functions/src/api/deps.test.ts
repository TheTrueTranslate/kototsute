import { describe, it, expect } from "vitest";
import { createDefaultDeps } from "./deps";

describe("deps", () => {
  it("provides case repository", () => {
    const deps = createDefaultDeps();
    expect(deps.caseRepo).toBeDefined();
  });
});
