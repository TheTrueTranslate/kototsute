import { describe, it, expect } from "vitest";
import { Plan } from "./plan";
import { Hash, TxId } from "@kototsute/shared";
import { OccurredAt } from "./value/occurred-at";
import { PlanId } from "./value/plan-id";

describe("Plan", () => {
  it("creates draft", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const plan = Plan.createDraft(PlanId.create("plan_1"), Hash.create("a1"), now);

    expect(plan.getStatus()).toBe("DRAFT");
    expect(plan.getVersion()).toBe(1);
    expect(plan.getAnchoredTxId()).toBeNull();
  });

  it("activates", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const plan = Plan.createDraft(PlanId.create("plan_1"), Hash.create("a1"), now);
    const active = plan.activate(TxId.create("a".repeat(64)), now);

    expect(active.getStatus()).toBe("ACTIVE");
    expect(active.getAnchoredTxId()?.toString()).toBe("a".repeat(64));
  });
});
