import { describe, expect, it } from "vitest";
import { todoMaster } from "./todo-master";

describe("todoMaster", () => {
  it("exports sections", () => {
    expect(todoMaster.shared).toBeDefined();
    expect(todoMaster.owner).toBeDefined();
    expect(todoMaster.heir).toBeDefined();
  });
});
