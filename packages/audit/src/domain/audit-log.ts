import { OccurredAt } from "./value/occurred-at";
import { AuditLogId } from "./value/audit-log-id";

export class AuditLog {
  private constructor(
    private readonly id: AuditLogId,
    private readonly action: string,
    private readonly occurredAt: OccurredAt
  ) {}

  static record(id: AuditLogId, action: string, occurredAt: OccurredAt): AuditLog {
    return new AuditLog(id, action, occurredAt);
  }

  getAction(): string {
    return this.action;
  }

  getId(): AuditLogId {
    return this.id;
  }

  getOccurredAt(): OccurredAt {
    return this.occurredAt;
  }
}
