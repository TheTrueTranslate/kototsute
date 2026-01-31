import { describe, expect, it } from "vitest";
import { profileLabel } from "./ClaimDetailPage";

describe("claim profile label", () => {
  it("uses profile label", () => {
    expect(profileLabel).toBe("被相続人プロフィール");
  });
});
