import { describe, expect, it } from "vitest";
import { scaleDisplayQuantity, scaleNutrientValue } from "@/domain/portionScaling";

/** openspec: qol-nav-scale-delete — portion-slider display math. */
describe("scaleDisplayQuantity", () => {
  it("is exact identity at factor 1 (no rounding of the stored value)", () => {
    expect(scaleDisplayQuantity(0.333333, 1)).toBe(0.333333);
  });

  it("scales 2 cup to 3 cup at 1.5×", () => {
    expect(scaleDisplayQuantity(2, 1.5)).toBe(3);
  });

  it("shows the honest linear COUNT value (1 each at 1.5× → 1.5)", () => {
    expect(scaleDisplayQuantity(1, 1.5)).toBe(1.5);
  });

  it("rounds to at most 2 decimals (1/3 × 2 → 0.67)", () => {
    expect(scaleDisplayQuantity(0.333333, 2)).toBe(0.67);
  });
});

describe("scaleNutrientValue", () => {
  it("scales values and passes null through", () => {
    expect(scaleNutrientValue(100, 1.5)).toBe(150);
    expect(scaleNutrientValue(null, 1.5)).toBeNull();
  });
});
