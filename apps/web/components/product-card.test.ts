import { describe, expect, it } from "vitest";

import { formatMoney } from "./product-card";

describe("formatMoney", () => {
  it("preserves minor currency units", () => {
    const formatted = formatMoney("49.50", "TJS");
    expect(formatted).toContain("49,50");
    expect(formatted).not.toContain("50,00");
  });
});
