import { describe, it, expect } from "vitest";
import { AuditLog } from "./audit-log";
import { OccurredAt } from "./value/occurred-at";
import { AuditLogId } from "./value/audit-log-id";

describe("AuditLog", () => {
  it("records action", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const log = AuditLog.record(AuditLogId.create("audit_1"), "PLAN_CREATED", now);

    expect(log.getAction()).toBe("PLAN_CREATED");
  });
});
