import { DomainError } from "@kototsute/shared";

export class PlanId {
  private constructor(private readonly value: string) {}

  static create(value: string): PlanId {
    if (!value || value.trim().length === 0) {
      throw new DomainError("PLAN_ID_EMPTY", "PlanId is empty");
    }
    return new PlanId(value);
  }

  static reconstruct(value: string): PlanId {
    return PlanId.create(value);
  }

  toString(): string {
    return this.value;
  }
}
