import { DomainError } from "@kototsute/shared";

export class DeathAttestationId {
  private constructor(private readonly value: string) {}

  static create(value: string): DeathAttestationId {
    if (!value || value.trim().length === 0) {
      throw new DomainError("DEATH_ATTESTATION_ID_EMPTY", "DeathAttestationId is empty");
    }
    return new DeathAttestationId(value);
  }

  static reconstruct(value: string): DeathAttestationId {
    return DeathAttestationId.create(value);
  }

  toString(): string {
    return this.value;
  }
}
