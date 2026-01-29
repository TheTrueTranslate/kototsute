import { OccurredAt } from "./value/occurred-at";
import { CaseId } from "./value/case-id";
import type { CaseStatus } from "./case-status";

export class Case {
  private constructor(
    private readonly id: CaseId,
    private readonly status: CaseStatus,
    private readonly updatedAt: OccurredAt
  ) {}

  static create(id: CaseId, now: OccurredAt): Case {
    return new Case(id, "DRAFT", now);
  }

  moveToWaiting(now: OccurredAt): Case {
    return new Case(this.id, "WAITING", now);
  }

  moveToInProgress(now: OccurredAt): Case {
    return new Case(this.id, "IN_PROGRESS", now);
  }

  complete(now: OccurredAt): Case {
    return new Case(this.id, "COMPLETED", now);
  }

  getStatus(): CaseStatus {
    return this.status;
  }

  getId(): CaseId {
    return this.id;
  }

  getUpdatedAt(): OccurredAt {
    return this.updatedAt;
  }
}
