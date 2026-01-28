import { describe, it, expect } from "vitest";
import { Hash } from "./hash.js";
import { TxId } from "./tx-id.js";
import { Time } from "../time/time.js";

describe("Hash", () => {
  it("throws when empty", () => {
    expect(() => Hash.create("")).toThrow();
  });

  it("throws when not hex", () => {
    expect(() => Hash.create("xyz")).toThrow();
  });

  it("returns value as string", () => {
    const hash = Hash.create("a1");
    expect(hash.toString()).toBe("a1");
  });
});

describe("TxId", () => {
  it("throws when empty", () => {
    expect(() => TxId.create("")).toThrow();
  });

  it("throws when not 64 hex chars", () => {
    expect(() => TxId.create("a1")).toThrow();
  });

  it("returns value as string", () => {
    const txid = TxId.create("a".repeat(64));
    expect(txid.toString()).toBe("a".repeat(64));
  });
});

describe("Time", () => {
  it("throws when invalid date", () => {
    expect(() => Time.create(new Date("invalid"))).toThrow();
  });

  it("reconstructs from ISO string", () => {
    const iso = new Date("2024-01-01T00:00:00.000Z").toISOString();
    const time = Time.reconstruct(iso);
    expect(time.toISOString()).toBe(iso);
  });
});
