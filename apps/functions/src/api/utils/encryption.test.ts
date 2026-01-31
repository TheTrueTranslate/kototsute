import { describe, it, expect } from "vitest";
import { encryptPayload, decryptPayload } from "./encryption.js";

process.env.ASSET_LOCK_ENCRYPTION_KEY = Buffer.from("a".repeat(32)).toString("base64");

describe("encryption", () => {
  it("roundtrips payload", () => {
    const encrypted = encryptPayload("secret");
    expect(decryptPayload(encrypted)).toBe("secret");
  });
});
