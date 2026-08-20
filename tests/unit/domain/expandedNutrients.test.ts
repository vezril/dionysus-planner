import { describe, expect, it } from "vitest";
import { mirrorNutritionPerCanonicalUnit } from "@/domain/cooking";
import { scaleNutritionFields } from "@/domain/nutritionBasis";
import { ingredientSchema } from "@/domain/validation/ingredient.schema";

/** openspec: expanded-nutrients — the trio behaves like every optional
 * nutrient, and rides the cook mirror's micronutrient map. */

const base = {
  name: "Butter",
  unitClass: "MASS",
  caloriesPerRef: 717,
  proteinPerRef: 0.9,
  carbsPerRef: 0.1,
  fatPerRef: 81,
};

describe("saturated/trans fat + cholesterol", () => {
  it("schema: absent valid, values accepted, negatives rejected", () => {
    expect(ingredientSchema.safeParse(base).success).toBe(true);
    expect(
      ingredientSchema.safeParse({ ...base, saturatedFatGPerRef: 51.4, transFatGPerRef: 3.3, cholesterolMgPerRef: 215 })
        .success,
    ).toBe(true);
    expect(ingredientSchema.safeParse({ ...base, cholesterolMgPerRef: -1 }).success).toBe(false);
  });

  it("basis conversion scales all three, nulls pass through", () => {
    const fields = {
      caloriesPerRef: 100, proteinPerRef: 0, carbsPerRef: 0, fatPerRef: 10,
      fiberPerRef: null, sugarPerRef: null, sodiumMgPerRef: null, alcoholGPerRef: null,
      saturatedFatGPerRef: 8, transFatGPerRef: null, cholesterolMgPerRef: 30,
    };
    const scaled = scaleNutritionFields(fields, 0.5);
    expect(scaled.saturatedFatGPerRef).toBe(4);
    expect(scaled.transFatGPerRef).toBeNull();
    expect(scaled.cholesterolMgPerRef).toBe(15);
  });

  it("cook mirror rides the micronutrient map ÷ reference", () => {
    const mirror = mirrorNutritionPerCanonicalUnit({
      id: 1, name: "Butter", unitClass: "MASS", densityGPerMl: null,
      caloriesPerRef: 717, proteinPerRef: 0.9, carbsPerRef: 0.1, fatPerRef: 81,
      sodiumMgPerRef: null, saturatedFatGPerRef: 51.4, transFatGPerRef: null, cholesterolMgPerRef: 215,
    });
    expect(mirror.micronutrients.saturatedFatG).toBeCloseTo(0.514, 10);
    expect(mirror.micronutrients.cholesterolMg).toBeCloseTo(2.15, 10);
    expect("transFatG" in mirror.micronutrients).toBe(false);
  });
});
