import { DomainError } from "@kototsute/shared";

export class CredentialId {
  private constructor(private readonly value: string) {}

  static create(value: string): CredentialId {
    if (!value || value.trim().length === 0) {
      throw new DomainError("CREDENTIAL_ID_EMPTY", "CredentialId is empty");
    }
    return new CredentialId(value);
  }

  static reconstruct(value: string): CredentialId {
    return CredentialId.create(value);
  }

  toString(): string {
    return this.value;
  }
}
