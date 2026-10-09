import { describe, expect, it } from "vitest";

import { formatTajikPhone, isTajikPhone, normalizeTajikPhone } from "./phone";

describe("Tajik phone normalization", () => {
  it.each([
    ["+992901234567", "+992901234567"],
    ["992 90 123 45 67", "+992901234567"],
    ["90-123-45-67", "+992901234567"],
    ["0901234567", "+992901234567"],
  ])("normalizes %s to one E.164 identity", (input, expected) => {
    expect(normalizeTajikPhone(input)).toBe(expected);
  });

  it("rejects non-Tajik and malformed numbers", () => {
    expect(() => normalizeTajikPhone("+79001234567")).toThrow();
    expect(() => normalizeTajikPhone("+992000000000")).toThrow();
    expect(isTajikPhone("123")).toBe(false);
  });

  it("formats separately from canonical storage", () => {
    expect(formatTajikPhone("+992901234567")).toBe("+992 901 23 45 67");
  });
});
