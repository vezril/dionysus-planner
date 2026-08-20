import { describe, expect, it } from "vitest";
import { computeRecipeNutrition } from "@/domain/nutrition";
import { scaleNutritionFields } from "@/domain/nutritionBasis";
import { ingredientSchema } from "@/domain/validation/ingredient.schema";

/** openspec: alcohol-tracking — alcohol behaves exactly like the other
 * optional nutrients. */

const base = {
  name: "Beer",
  unitClass: "VOLUME",
  caloriesPerRef: 43,
  proteinPerRef: 0.5,
  carbsPerRef: 3.6,
  fatPerRef: 0,
};

describe("alcohol as an optional nutrient", () => {
  it("schema: absent is valid, non-negative value accepted, negative rejected", () => {
    expect(ingredientSchema.safeParse(base).success).toBe(true);
    expect(ingredientSchema.safeParse({ ...base, alcoholGPerRef: 3.9 }).success).toBe(true);
    expect(ingredientSchema.safeParse({ ...base, alcoholGPerRef: -1 }).success).toBe(false);
  });

  it("basis conversion scales alcohol and passes null through", () => {
    const fields = {
      caloriesPerRef: 150,
      proteinPerRef: 0,
      carbsPerRef: 10,
      fatPerRef: 0,
      fiberPerRef: null,
      sugarPerRef: null,
      sodiumMgPerRef: null,
      alcoholGPerRef: 14,
      saturatedFatGPerRef: null,
      transFatGPerRef: null,
      cholesterolMgPerRef: null,
    };
    expect(scaleNutritionFields(fields, 100 / 355).alcoholGPerRef).toBe(3.9437);
    expect(scaleNutritionFields({ ...fields, alcoholGPerRef: null }, 0.5).alcoholGPerRef).toBeNull();
  });

  it("recipe totals include alcohol only when every constituent has it", () => {
    const ingredient = (id: number, alcoholGPerRef: number | null) => ({
      id,
      unitClass: "MASS" as const,
      densityGPerMl: null,
      caloriesPerRef: 100,
      proteinPerRef: 1,
      carbsPerRef: 1,
      fatPerRef: 1,
      fiberPerRef: null,
      sugarPerRef: null,
      sodiumMgPerRef: null,
      alcoholGPerRef,
      saturatedFatGPerRef: null,
      transFatGPerRef: null,
      cholesterolMgPerRef: null,
    });
    const recipe = {
      id: 1,
      servings: 2,
      lines: [
        { id: 1, ingredientId: 1, quantityCanonical: 100, entryUnitClass: "MASS" as const },
        { id: 2, ingredientId: 2, quantityCanonical: 100, entryUnitClass: "MASS" as const },
      ],
    };

    const complete = computeRecipeNutrition(recipe, { 1: ingredient(1, 4), 2: ingredient(2, 6) });
    expect(complete.totals.alcoholG).toEqual({ value: 10, incomplete: false });
    expect(complete.perServing.alcoholG.value).toBe(5);

    const partial = computeRecipeNutrition(recipe, { 1: ingredient(1, 4), 2: ingredient(2, null) });
    expect(partial.totals.alcoholG).toEqual({ value: null, incomplete: true });
  });
});
