import { describe, it, expect } from "vitest";
import { Case } from "./case";
import { OccurredAt } from "./value/occurred-at";
import { CaseId } from "./value/case-id";

describe("Case", () => {
  it("transitions status", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const created = Case.create(CaseId.create("case_1"), now);
    expect(created.getStatus()).toBe("CREATED");

    const acknowledged = created.acknowledge(now);
    expect(acknowledged.getStatus()).toBe("ACKNOWLEDGED");

    const needMoreDocs = acknowledged.needMoreDocs(now);
    expect(needMoreDocs.getStatus()).toBe("NEED_MORE_DOCS");

    const completed = needMoreDocs.complete(now);
    expect(completed.getStatus()).toBe("COMPLETED");
  });
});
