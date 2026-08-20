import { describe, expect, it } from "vitest";
import { MICRONUTRIENTS, scaleMicronutrients } from "@/domain/micronutrients";
import { ingredientSchema } from "@/domain/validation/ingredient.schema";
import { customPantryItemSchema } from "@/domain/validation/customPantryItem.schema";

/** openspec: vitamin-tracking — registry, schema rules, basis scaling. */

const base = {
  name: "Vitamin D3",
  unitClass: "COUNT",
  caloriesPerRef: 0,
  proteinPerRef: 0,
  carbsPerRef: 0,
  fatPerRef: 0,
};

describe("MICRONUTRIENTS registry", () => {
  it("has the 16 v1 nutrients, each with a label and a µg/mg unit", () => {
    expect(Object.keys(MICRONUTRIENTS)).toHaveLength(16);
    for (const def of Object.values(MICRONUTRIENTS)) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(["µg", "mg"]).toContain(def.unit);
    }
  });
});

describe("micronutrients on the entry schemas", () => {
  it("absent is valid; known keys with positive amounts accepted", () => {
    expect(ingredientSchema.safeParse(base).success).toBe(true);
    expect(
      ingredientSchema.safeParse({ ...base, micronutrients: [{ key: "vitaminD", amountPerRef: 25 }] }).success,
    ).toBe(true);
    expect(
      customPantryItemSchema.safeParse({
        ...base,
        initialQuantity: 90,
        unit: "each",
        micronutrients: [{ key: "vitaminC", amountPerRef: 60 }],
      }).success,
    ).toBe(true);
  });

  it("unknown keys and non-positive amounts rejected", () => {
    expect(
      ingredientSchema.safeParse({ ...base, micronutrients: [{ key: "unobtainium", amountPerRef: 1 }] }).success,
    ).toBe(false);
    expect(
      ingredientSchema.safeParse({ ...base, micronutrients: [{ key: "vitaminD", amountPerRef: 0 }] }).success,
    ).toBe(false);
  });

  it("duplicate keys rejected", () => {
    const result = ingredientSchema.safeParse({
      ...base,
      micronutrients: [
        { key: "vitaminD", amountPerRef: 25 },
        { key: "vitaminD", amountPerRef: 10 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/once/i);
    }
  });
});

describe("scaleMicronutrients", () => {
  it("scales amounts by the basis factor, rounded to 4 decimals", () => {
    expect(scaleMicronutrients([{ key: "vitaminC", amountPerRef: 60 }], 100 / 355)).toEqual([
      { key: "vitaminC", amountPerRef: 16.9014 },
    ]);
  });

  it("is identity at factor 1", () => {
    expect(scaleMicronutrients([{ key: "zinc", amountPerRef: 11 }], 1)).toEqual([
      { key: "zinc", amountPerRef: 11 },
    ]);
  });
});
