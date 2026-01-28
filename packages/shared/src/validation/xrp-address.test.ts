import { describe, it, expect } from "vitest";
import { isXrpAddress } from "./xrp-address.js";

describe("isXrpAddress", () => {
  it("accepts valid XRP addresses", () => {
    expect(isXrpAddress("rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe")).toBe(true);
    expect(isXrpAddress("rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh")).toBe(true);
  });

  it("rejects invalid XRP addresses", () => {
    expect(isXrpAddress("")).toBe(false);
    expect(isXrpAddress("xrp_abc")).toBe(false);
    expect(isXrpAddress("r123")).toBe(false);
    expect(isXrpAddress("rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe$$$$")).toBe(false);
  });
});
