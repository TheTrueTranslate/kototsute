import { describe, expect, it } from "vitest";
import { decodeBase64ToBytes } from "./ClaimDetailPage";

describe("claim file helpers", () => {
  it("decodes base64 to bytes", () => {
    const bytes = decodeBase64ToBytes("SGVsbG8=");
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });
});
