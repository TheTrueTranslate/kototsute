import { Hash, TxId } from "@kototsute/shared";
import { OccurredAt } from "./value/occurred-at";
import { DeathAttestationId } from "./value/death-attestation-id";
import type { DeathAttestationStatus } from "./death-attestation-status";

export class DeathAttestation {
  private constructor(
    private readonly id: DeathAttestationId,
    private readonly status: DeathAttestationStatus,
    private readonly hash: Hash,
    private readonly anchoredTxId: TxId | null,
    private readonly updatedAt: OccurredAt
  ) {}

  static request(id: DeathAttestationId, hash: Hash, now: OccurredAt): DeathAttestation {
    return new DeathAttestation(id, "REQUESTED", hash, null, now);
  }

  approve(txId: TxId, now: OccurredAt): DeathAttestation {
    return new DeathAttestation(this.id, "APPROVED", this.hash, txId, now);
  }

  getStatus(): DeathAttestationStatus {
    return this.status;
  }

  getAnchoredTxId(): TxId | null {
    return this.anchoredTxId;
  }

  getId(): DeathAttestationId {
    return this.id;
  }

  getHash(): Hash {
    return this.hash;
  }

  getUpdatedAt(): OccurredAt {
    return this.updatedAt;
  }
}
