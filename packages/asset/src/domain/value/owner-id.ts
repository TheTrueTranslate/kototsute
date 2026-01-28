import { requireNonEmpty } from "@kototsute/shared";

export class OwnerId {
  private constructor(private readonly value: string) {}

  static create(value: string): OwnerId {
    requireNonEmpty(value, "OWNER_ID_EMPTY", "OwnerId is empty");
    return new OwnerId(value);
  }

  static reconstruct(value: string): OwnerId {
    return OwnerId.create(value);
  }

  toString(): string {
    return this.value;
  }
}
