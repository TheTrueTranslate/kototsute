import { describe, it, expect } from "vitest";
import { DeathAttestation } from "./death-attestation";
import { Hash, TxId } from "@kototsute/shared";
import { OccurredAt } from "./value/occurred-at";
import { DeathAttestationId } from "./value/death-attestation-id";

describe("DeathAttestation", () => {
  it("requests", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const attestation = DeathAttestation.request(
      DeathAttestationId.create("att_1"),
      Hash.create("a1"),
      now
    );

    expect(attestation.getStatus()).toBe("REQUESTED");
    expect(attestation.getAnchoredTxId()).toBeNull();
  });

  it("approves", () => {
    const now = OccurredAt.create(new Date("2024-01-01T00:00:00.000Z"));
    const attestation = DeathAttestation.request(
      DeathAttestationId.create("att_1"),
      Hash.create("a1"),
      now
    );
    const approved = attestation.approve(TxId.create("a".repeat(64)), now);

    expect(approved.getStatus()).toBe("APPROVED");
    expect(approved.getAnchoredTxId()?.toString()).toBe("a".repeat(64));
  });
});
