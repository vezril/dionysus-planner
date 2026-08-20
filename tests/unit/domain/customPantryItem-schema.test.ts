import { describe, expect, it } from "vitest";
import { customPantryItemSchema } from "@/domain/validation/customPantryItem.schema";
import { ingredientSchema } from "@/domain/validation/ingredient.schema";

/**
 * openspec: custom-pantry-items — the one-step create form's schema, plus
 * the product-identity fields added to ingredientSchema.
 */

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ritz crackers",
    unitClass: "MASS",
    caloriesPerRef: 492,
    proteinPerRef: 7,
    carbsPerRef: 61,
    fatPerRef: 24,
    initialQuantity: 200,
    unit: "g",
    ...overrides,
  };
}

describe("customPantryItemSchema", () => {
  it("accepts a full branded item", () => {
    const result = customPantryItemSchema.safeParse(
      validItem({ brand: "Ritz", barcode: "064100128866", packageQuantity: 200, packageUnit: "g" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a minimal item (no product identity)", () => {
    expect(customPantryItemSchema.safeParse(validItem()).success).toBe(true);
  });

  it("accepts initialQuantity 0 — out-of-stock products are still products", () => {
    expect(customPantryItemSchema.safeParse(validItem({ initialQuantity: 0 })).success).toBe(true);
  });

  it("rejects a negative initialQuantity", () => {
    expect(customPantryItemSchema.safeParse(validItem({ initialQuantity: -1 })).success).toBe(false);
  });

  it("rejects a missing name", () => {
    const input = validItem();
    delete (input as Record<string, unknown>).name;
    expect(customPantryItemSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a package quantity without a unit", () => {
    const result = customPantryItemSchema.safeParse(validItem({ packageQuantity: 200 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("packageUnit");
    }
  });

  it("rejects a blank barcode (whitespace-only)", () => {
    expect(customPantryItemSchema.safeParse(validItem({ barcode: "  " })).success).toBe(false);
  });

  it("rejects an unknown unit", () => {
    expect(customPantryItemSchema.safeParse(validItem({ unit: "smidgen" })).success).toBe(false);
  });
});

describe("ingredientSchema product-identity extension", () => {
  const base = {
    name: "Ritz crackers",
    unitClass: "MASS",
    caloriesPerRef: 492,
    proteinPerRef: 7,
    carbsPerRef: 61,
    fatPerRef: 24,
  };

  it("still accepts an ingredient with no product fields (back-compat)", () => {
    expect(ingredientSchema.safeParse(base).success).toBe(true);
  });

  it("accepts all four product fields", () => {
    const result = ingredientSchema.safeParse({
      ...base,
      brand: "Ritz",
      barcode: "064100128866",
      packageQuantity: 200,
      packageUnit: "g",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a package quantity without a unit", () => {
    expect(ingredientSchema.safeParse({ ...base, packageQuantity: 200 }).success).toBe(false);
  });

  it("rejects a non-positive package quantity", () => {
    expect(
      ingredientSchema.safeParse({ ...base, packageQuantity: 0, packageUnit: "g" }).success,
    ).toBe(false);
  });
});
