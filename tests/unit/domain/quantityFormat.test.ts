import { describe, expect, it } from "vitest";
import { formatQuantity } from "@/domain/quantityFormat";

/** openspec: recipe-links-precision — the display rounding boundary. */
describe("formatQuantity", () => {
  it("drops float artifacts from conversion and pack math", () => {
    expect(formatQuantity(305.00000000000006)).toBe("305");
    expect(formatQuantity(0.30000000000000004)).toBe("0.3");
    expect(formatQuantity(1.9999999999999998)).toBe("2");
  });

  it("keeps genuine fractions, to two places", () => {
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatQuantity(0.33)).toBe("0.33");
    expect(formatQuantity(2.345)).toBe("2.35");
    expect(formatQuantity(61)).toBe("61");
  });

  it("never renders trailing zeros", () => {
    expect(formatQuantity(1.5)).not.toContain("1.50");
    expect(formatQuantity(305.0)).toBe("305");
  });

  it("handles zero and negatives without surprises", () => {
    expect(formatQuantity(0)).toBe("0");
    expect(formatQuantity(-0.5)).toBe("-0.5");
  });

  it("degrades non-finite input to 0 rather than 'NaN' in the UI", () => {
    expect(formatQuantity(Number.NaN)).toBe("0");
    expect(formatQuantity(Number.POSITIVE_INFINITY)).toBe("0");
  });
});
