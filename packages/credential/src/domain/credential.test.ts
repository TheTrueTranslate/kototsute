import { describe, it, expect } from "vitest";
import { Credential } from "./credential";
import { OccurredAt } from "./value/occurred-at";
import { CredentialId } from "./value/credential-id";

describe("Credential", () => {
  it("activates and deactivates", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const active = Credential.activate(CredentialId.create("cred_1"), "KOTODUTE_HEIR", now);

    expect(active.isActive()).toBe(true);
    expect(active.getType()).toBe("KOTODUTE_HEIR");

    const inactive = active.deactivate(now);
    expect(inactive.isActive()).toBe(false);
  });
});
