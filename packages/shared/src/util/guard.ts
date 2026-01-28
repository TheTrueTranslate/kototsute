import { DomainError } from "../error/domain-error";

export const requireNonEmpty = (value: string, code: string, message: string): void => {
  if (!value || value.trim().length === 0) {
    throw new DomainError(code, message);
  }
};
