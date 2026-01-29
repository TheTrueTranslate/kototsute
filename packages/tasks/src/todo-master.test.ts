import { describe, expect, it } from "vitest";
import { todoMaster } from "./todo-master";

const allIds = [...todoMaster.shared, ...todoMaster.owner, ...todoMaster.heir].map(
  (task) => task.id
);

describe("todoMaster", () => {
  it("exports sections", () => {
    expect(todoMaster.shared).toBeDefined();
    expect(todoMaster.owner).toBeDefined();
    expect(todoMaster.heir).toBeDefined();
  });

  it("does not have duplicate ids", () => {
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });
});
