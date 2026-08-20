import { describe, expect, it } from "vitest";
import { customPantryItemSchema } from "@/domain/validation/customPantryItem.schema";
import { ingredientSchema } from "@/domain/validation/ingredient.schema";

/**
 * openspec: nutrition-basis-and-edit — the optional basis fields on both
 * entry schemas (structural rules only; class check is the action's).
 */
const ingredientBase = {
  name: "Cola",
  unitClass: "VOLUME",
  caloriesPerRef: 150,
  proteinPerRef: 0,
  carbsPerRef: 39,
  fatPerRef: 0,
};

const itemBase = { ...ingredientBase, initialQuantity: 355, unit: "mL" };

describe("nutrition basis fields", () => {
  it("ingredientSchema: absent basis is valid (back-compat)", () => {
    expect(ingredientSchema.safeParse(ingredientBase).success).toBe(true);
  });

  it("ingredientSchema: full basis accepted", () => {
    expect(
      ingredientSchema.safeParse({ ...ingredientBase, nutritionBasisQuantity: 355, nutritionBasisUnit: "mL" })
        .success,
    ).toBe(true);
  });

  it("ingredientSchema: basis quantity without unit is rejected on the unit path", () => {
    const result = ingredientSchema.safeParse({ ...ingredientBase, nutritionBasisQuantity: 355 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("nutritionBasisUnit");
    }
  });

  it("ingredientSchema: non-positive basis quantity is rejected", () => {
    expect(
      ingredientSchema.safeParse({ ...ingredientBase, nutritionBasisQuantity: 0, nutritionBasisUnit: "mL" })
        .success,
    ).toBe(false);
  });

  it("customPantryItemSchema: full basis accepted", () => {
    expect(
      customPantryItemSchema.safeParse({ ...itemBase, nutritionBasisQuantity: 355, nutritionBasisUnit: "mL" })
        .success,
    ).toBe(true);
  });

  it("customPantryItemSchema: basis quantity without unit is rejected", () => {
    expect(customPantryItemSchema.safeParse({ ...itemBase, nutritionBasisQuantity: 355 }).success).toBe(false);
  });
});
