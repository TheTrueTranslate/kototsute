import { Hash, TxId } from "@kototsute/shared";
import { OccurredAt } from "./value/occurred-at";
import { PlanId } from "./value/plan-id";
import type { PlanStatus } from "./plan-status";

export class Plan {
  private constructor(
    private readonly id: PlanId,
    private readonly status: PlanStatus,
    private readonly version: number,
    private readonly hash: Hash,
    private readonly anchoredTxId: TxId | null,
    private readonly updatedAt: OccurredAt
  ) {}

  static createDraft(id: PlanId, hash: Hash, now: OccurredAt): Plan {
    return new Plan(id, "DRAFT", 1, hash, null, now);
  }

  activate(txId: TxId, now: OccurredAt): Plan {
    return new Plan(this.id, "ACTIVE", this.version, this.hash, txId, now);
  }

  getStatus(): PlanStatus {
    return this.status;
  }

  getVersion(): number {
    return this.version;
  }

  getAnchoredTxId(): TxId | null {
    return this.anchoredTxId;
  }

  getId(): PlanId {
    return this.id;
  }

  getHash(): Hash {
    return this.hash;
  }

  getUpdatedAt(): OccurredAt {
    return this.updatedAt;
  }
}
