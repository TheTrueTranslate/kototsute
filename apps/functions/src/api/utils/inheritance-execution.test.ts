import { describe, expect, it } from "vitest";
import { removeUndefinedValues } from "./inheritance-execution";

describe("removeUndefinedValues", () => {
  it("removes undefined values recursively", () => {
    const input = {
      a: 1,
      b: undefined,
      c: {
        d: undefined,
        e: "ok"
      },
      f: [1, undefined, { g: undefined, h: 2 }]
    };

    expect(removeUndefinedValues(input)).toEqual({
      a: 1,
      c: { e: "ok" },
      f: [1, { h: 2 }]
    });
  });
});
