import { OccurredAt } from "./value/occurred-at";
import { CredentialId } from "./value/credential-id";

export type CredentialType = "KOTODUTE_HEIR" | "KOTODUTE_FI" | "KOTODUTE_ADMIN";

export class Credential {
  private constructor(
    private readonly id: CredentialId,
    private readonly type: CredentialType,
    private readonly active: boolean,
    private readonly updatedAt: OccurredAt
  ) {}

  static activate(id: CredentialId, type: CredentialType, now: OccurredAt): Credential {
    return new Credential(id, type, true, now);
  }

  deactivate(now: OccurredAt): Credential {
    return new Credential(this.id, this.type, false, now);
  }

  isActive(): boolean {
    return this.active;
  }

  getType(): CredentialType {
    return this.type;
  }

  getId(): CredentialId {
    return this.id;
  }

  getUpdatedAt(): OccurredAt {
    return this.updatedAt;
  }
}
