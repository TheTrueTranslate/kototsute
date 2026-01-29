import { describe, it, expect } from "vitest";
import { Case } from "./case";
import { OccurredAt } from "./value/occurred-at";
import { CaseId } from "./value/case-id";

describe("Case", () => {
  it("moves through draft -> waiting -> in_progress -> completed", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const base = Case.create(CaseId.create("case-1"), now);
    const waiting = base.moveToWaiting(now);
    const progress = waiting.moveToInProgress(now);
    const completed = progress.complete(now);
    expect(completed.getStatus()).toBe("COMPLETED");
  });
});
