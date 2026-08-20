import { describe, expect, it } from "vitest";
import { nutritionScaleFactor, scaleNutritionFields } from "@/domain/nutritionBasis";

/**
 * openspec: nutrition-basis-and-edit — label-basis → per-reference
 * conversion (the "355 mL soda can, no math" feature).
 */
describe("nutritionScaleFactor", () => {
  it("computes the soda-can factor: per 355 mL on a VOLUME ingredient", () => {
    const result = nutritionScaleFactor(355, "mL", "VOLUME");
    expect(result).toEqual({ ok: true, factor: 100 / 355 });
  });

  it("is identity for the reference basis (100 g on MASS)", () => {
    expect(nutritionScaleFactor(100, "g", "MASS")).toEqual({ ok: true, factor: 1 });
  });

  it("halves for per-2 on COUNT", () => {
    expect(nutritionScaleFactor(2, "each", "COUNT")).toEqual({ ok: true, factor: 0.5 });
  });

  it("converts non-canonical units within the class (per 1 cup on VOLUME)", () => {
    const result = nutritionScaleFactor(1, "cup", "VOLUME");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 1 cup = 240 mL canonical (domain/units.ts) -> factor 100/240
      expect(result.factor).toBeCloseTo(100 / 240, 10);
    }
  });

  it("rejects a cross-class basis (per mL on a MASS ingredient) — never a silent guess", () => {
    expect(nutritionScaleFactor(355, "mL", "MASS")).toEqual({ ok: false, error: "CLASS_MISMATCH" });
  });

  it("rejects an unknown unit", () => {
    expect(nutritionScaleFactor(1, "smidgen", "MASS")).toEqual({ ok: false, error: "UNKNOWN_UNIT" });
  });

  it("rejects a non-positive quantity", () => {
    expect(nutritionScaleFactor(0, "g", "MASS")).toEqual({ ok: false, error: "NON_POSITIVE_QUANTITY" });
  });
});

describe("scaleNutritionFields", () => {
  const canValues = {
    caloriesPerRef: 150,
    proteinPerRef: 0,
    carbsPerRef: 39,
    fatPerRef: 0,
    fiberPerRef: null,
    sugarPerRef: 39,
    sodiumMgPerRef: 30,
    alcoholGPerRef: null,
    saturatedFatGPerRef: null,
    transFatGPerRef: null,
    cholesterolMgPerRef: null,
  };

  it("scales the soda can to per-100 mL, rounded to 4 decimals", () => {
    const scaled = scaleNutritionFields(canValues, 100 / 355);
    expect(scaled.caloriesPerRef).toBe(42.2535);
    expect(scaled.carbsPerRef).toBe(10.9859);
    expect(scaled.sugarPerRef).toBe(10.9859);
    expect(scaled.sodiumMgPerRef).toBe(8.4507);
  });

  it("passes nulls through untouched", () => {
    expect(scaleNutritionFields(canValues, 0.5).fiberPerRef).toBeNull();
  });

  it("is identity at factor 1", () => {
    expect(scaleNutritionFields(canValues, 1)).toEqual(canValues);
  });
});
