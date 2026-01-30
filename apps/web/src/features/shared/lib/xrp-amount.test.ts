import { describe, expect, it } from "vitest";
import {
  dropsToXrpInput,
  formatXrp,
  normalizeNumberInput,
  xrpToDropsInput
} from "./xrp-amount";

describe("xrp amount helpers", () => {
  it("normalizes numeric input", () => {
    expect(normalizeNumberInput("12.3.4"))
      .toBe("12.34");
    expect(normalizeNumberInput("abc1.20xyz"))
      .toBe("1.20");
  });

  it("formats xrp values", () => {
    expect(formatXrp(1)).toBe("1");
    expect(formatXrp(0.000001)).toBe("0.000001");
  });

  it("converts drops to xrp input", () => {
    expect(dropsToXrpInput("1")).toBe("0.000001");
    expect(dropsToXrpInput("1000000")).toBe("1");
  });

  it("converts xrp to drops input", () => {
    expect(xrpToDropsInput("0.000001")).toBe("1");
    expect(xrpToDropsInput("1"))
      .toBe("1000000");
  });
});
