import { describe, expect, it } from "vitest";
import { todoMaster } from "./todo-master";

const allIds = [...todoMaster.owner, ...todoMaster.heir].map((task) => task.id);

describe("todoMaster", () => {
  it("does not include shared section", () => {
    expect("shared" in (todoMaster as Record<string, unknown>)).toBe(false);
  });

  it("includes confirmation tasks for owner and heir", () => {
    const ownerIds = todoMaster.owner.map((task) => task.id);
    const heirIds = todoMaster.heir.map((task) => task.id);
    expect(ownerIds).toContain("owner.confirm-plan");
    expect(ownerIds).toContain("owner.confirm-reserve");
    expect(ownerIds).toContain("owner.confirm-flow");
    expect(heirIds).toContain("heir.confirm-reserve");
  });

  it("does not have duplicate ids", () => {
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });
});
