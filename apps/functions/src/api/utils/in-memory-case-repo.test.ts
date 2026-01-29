import { describe, it, expect } from "vitest";
import { InMemoryCaseRepository } from "./in-memory-case-repo";

describe("InMemoryCaseRepository", () => {
  it("creates and finds case by owner", async () => {
    const repo = new InMemoryCaseRepository();
    const created = await repo.createCase({ ownerUid: "owner-1", ownerDisplayName: "山田" });
    const found = await repo.getCaseByOwnerUid("owner-1");
    expect(found?.caseId).toBe(created.caseId);
  });
});
