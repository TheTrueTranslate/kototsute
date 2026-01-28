import { DomainError } from "../error/domain-error.js";

const HEX_RE = /^[0-9a-fA-F]+$/;

export class Hash {
  private constructor(private readonly value: string) {}

  static create(value: string): Hash {
    if (!value || value.trim().length === 0) {
      throw new DomainError("HASH_EMPTY", "Hash is empty");
    }
    if (!HEX_RE.test(value)) {
      throw new DomainError("HASH_INVALID", "Hash must be hex string");
    }
    return new Hash(value);
  }

  static reconstruct(value: string): Hash {
    return Hash.create(value);
  }

  toString(): string {
    return this.value;
  }
}
