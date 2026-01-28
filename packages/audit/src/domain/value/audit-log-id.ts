import { DomainError } from "@kototsute/shared";

export class AuditLogId {
  private constructor(private readonly value: string) {}

  static create(value: string): AuditLogId {
    if (!value || value.trim().length === 0) {
      throw new DomainError("AUDIT_LOG_ID_EMPTY", "AuditLogId is empty");
    }
    return new AuditLogId(value);
  }

  static reconstruct(value: string): AuditLogId {
    return AuditLogId.create(value);
  }

  toString(): string {
    return this.value;
  }
}
