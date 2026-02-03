import { describe, it, expect } from "vitest";
import ja from "./consts/ja.json";
import en from "./consts/en.json";

const flattenKeys = (input: Record<string, any>, prefix = ""): string[] => {
  return Object.entries(input).flatMap(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, any>, next);
    }
    return [next];
  });
};

describe("locales", () => {
  it("ja/en のキーが一致する", () => {
    const jaKeys = flattenKeys(ja).sort();
    const enKeys = flattenKeys(en).sort();
    expect(jaKeys).toEqual(enKeys);
  });
});
