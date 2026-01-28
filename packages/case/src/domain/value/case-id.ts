import { DomainError } from "@kototsute/shared";

export class CaseId {
  private constructor(private readonly value: string) {}

  static create(value: string): CaseId {
    if (!value || value.trim().length === 0) {
      throw new DomainError("CASE_ID_EMPTY", "CaseId is empty");
    }
    return new CaseId(value);
  }

  static reconstruct(value: string): CaseId {
    return CaseId.create(value);
  }

  toString(): string {
    return this.value;
  }
}
