import { DomainError } from "../error/domain-error";

const TXID_RE = /^[0-9a-fA-F]{64}$/;

export class TxId {
  private constructor(private readonly value: string) {}

  static create(value: string): TxId {
    if (!value || value.trim().length === 0) {
      throw new DomainError("TXID_EMPTY", "TxId is empty");
    }
    if (!TXID_RE.test(value)) {
      throw new DomainError("TXID_INVALID", "TxId must be 64 hex chars");
    }
    return new TxId(value);
  }

  static reconstruct(value: string): TxId {
    return TxId.create(value);
  }

  toString(): string {
    return this.value;
  }
}
