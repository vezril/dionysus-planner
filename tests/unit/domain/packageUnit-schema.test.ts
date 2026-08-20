import { describe, expect, it } from "vitest";
import { customPantryItemSchema } from "@/domain/validation/customPantryItem.schema";
import { ingredientSchema } from "@/domain/validation/ingredient.schema";

/**
 * openspec: count-via-package-size — packageUnit must be a known unit key
 * on both entry schemas (it now drives COUNT↔MASS/VOLUME resolution).
 */
const ingredientBase = {
  name: "Fanta, Pineapple",
  unitClass: "VOLUME",
  caloriesPerRef: 42,
  proteinPerRef: 0,
  carbsPerRef: 11,
  fatPerRef: 0,
};

const itemBase = { ...ingredientBase, initialQuantity: 1, unit: "each" };

describe("packageUnit is a known unit key", () => {
  it("ingredientSchema: known key accepted", () => {
    expect(
      ingredientSchema.safeParse({ ...ingredientBase, packageQuantity: 355, packageUnit: "mL" }).success,
    ).toBe(true);
  });

  it("ingredientSchema: lowercase 'ml' rejected on the packageUnit path", () => {
    const result = ingredientSchema.safeParse({ ...ingredientBase, packageQuantity: 355, packageUnit: "ml" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("packageUnit");
    }
  });

  it("ingredientSchema: absent package still valid", () => {
    expect(ingredientSchema.safeParse(ingredientBase).success).toBe(true);
  });

  it("customPantryItemSchema: known key accepted", () => {
    expect(
      customPantryItemSchema.safeParse({ ...itemBase, packageQuantity: 355, packageUnit: "mL" }).success,
    ).toBe(true);
  });

  it("customPantryItemSchema: free text rejected", () => {
    expect(
      customPantryItemSchema.safeParse({ ...itemBase, packageQuantity: 355, packageUnit: "can" }).success,
    ).toBe(false);
  });
});
