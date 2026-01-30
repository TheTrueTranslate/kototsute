import { describe, expect, it } from "vitest";
import { shouldAutoRequestChallenge } from "./auto-challenge";

describe("shouldAutoRequestChallenge", () => {
  it("returns true when dialog is open and verify mode with wallet and no challenge", () => {
    expect(
      shouldAutoRequestChallenge({
        isOpen: true,
        mode: "verify",
        hasWallet: true,
        hasChallenge: false,
        isLoading: false
      })
    ).toBe(true);
  });

  it("returns false when already verified", () => {
    expect(
      shouldAutoRequestChallenge({
        isOpen: true,
        mode: "verify",
        hasWallet: true,
        hasChallenge: false,
        isLoading: false,
        isVerified: true
      } as any)
    ).toBe(false);
  });
});
