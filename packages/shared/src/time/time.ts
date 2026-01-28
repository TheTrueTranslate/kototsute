import { DomainError } from "../error/domain-error.js";

export class Time {
  private constructor(private readonly value: Date) {}

  static create(value: Date): Time {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new DomainError("TIME_INVALID", "Time is invalid");
    }
    return new Time(value);
  }

  static reconstruct(value: string): Time {
    return Time.create(new Date(value));
  }

  toDate(): Date {
    return new Date(this.value.getTime());
  }

  toISOString(): string {
    return this.value.toISOString();
  }
}
