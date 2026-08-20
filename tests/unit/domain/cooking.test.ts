import { describe, expect, it } from "vitest";
import {
  canonicalUnitForClass,
  mirrorNutritionPerCanonicalUnit,
  planCookConsumption,
  type CookLine,
  type CookPantryRow,
} from "@/domain/cooking";

/** openspec: cook-recipe-into-meals — consumption planning + mirror math. */

const fanta = {
  id: 353,
  name: "Fanta, Pineapple",
  unitClass: "VOLUME" as const,
  densityGPerMl: null,
  packageQuantity: 355,
  packageUnit: "mL",
  caloriesPerRef: 42,
  proteinPerRef: 0,
  carbsPerRef: 11,
  fatPerRef: 0,
  sodiumMgPerRef: null,
};

const flour = {
  id: 10,
  name: "Flour",
  unitClass: "MASS" as const,
  densityGPerMl: null,
  caloriesPerRef: 364,
  proteinPerRef: 10,
  carbsPerRef: 76,
  fatPerRef: 1,
  sodiumMgPerRef: 2,
};

function line(overrides: Partial<CookLine> & Pick<CookLine, "id" | "ingredient">): CookLine {
  return {
    quantityCanonical: 100,
    entryUnitClass: "MASS",
    displayQuantity: 100,
    displayUnit: "g",
    ...overrides,
  };
}

function pantry(rows: CookPantryRow[]): Map<number, CookPantryRow> {
  return new Map(rows.map((row) => [row.ingredientId, row]));
}

describe("planCookConsumption", () => {
  it("ok when stock covers the scaled requirement", () => {
    const plans = planCookConsumption(
      [line({ id: 1, ingredient: flour })],
      pantry([{ id: 7, ingredientId: 10, quantityCanonical: 500, entryUnitClass: "MASS" }]),
      1.5,
    );
    expect(plans[0]).toMatchObject({ status: "ok", requiredInPantryBasis: 150, pantryItemId: 7, availableInPantryBasis: 500 });
  });

  it("insufficient when the scaled requirement exceeds stock (floor-at-zero is the consumer's job)", () => {
    const plans = planCookConsumption(
      [line({ id: 1, ingredient: flour })],
      pantry([{ id: 7, ingredientId: 10, quantityCanonical: 120, entryUnitClass: "MASS" }]),
      1.5,
    );
    expect(plans[0]).toMatchObject({ status: "insufficient", requiredInPantryBasis: 150, availableInPantryBasis: 120 });
  });

  it("missing when there is no pantry row", () => {
    const plans = planCookConsumption([line({ id: 1, ingredient: flour })], pantry([]), 1);
    expect(plans[0]).toMatchObject({ status: "missing", requiredInPantryBasis: null, pantryItemId: null });
  });

  it("resolves a COUNT line into a mL pantry row via the package bridge", () => {
    const plans = planCookConsumption(
      [line({ id: 1, ingredient: fanta, quantityCanonical: 1, entryUnitClass: "COUNT", displayQuantity: 1, displayUnit: "each" })],
      pantry([{ id: 9, ingredientId: 353, quantityCanonical: 400, entryUnitClass: "VOLUME" }]),
      1,
    );
    expect(plans[0]).toMatchObject({ status: "ok", requiredInPantryBasis: 355 });
  });

  it("unresolved when the line cannot reach the pantry row's basis", () => {
    const plans = planCookConsumption(
      [line({ id: 1, ingredient: { ...flour, id: 11 }, entryUnitClass: "VOLUME", quantityCanonical: 240, displayQuantity: 1, displayUnit: "cup" })],
      pantry([{ id: 8, ingredientId: 11, quantityCanonical: 500, entryUnitClass: "MASS" }]),
      1,
    );
    expect(plans[0]).toMatchObject({ status: "unresolved", requiredInPantryBasis: null, pantryItemId: 8 });
  });

  it("mirror quantity uses the AUTHORED line resolved into the ingredient's class", () => {
    const plans = planCookConsumption(
      [line({ id: 1, ingredient: fanta, quantityCanonical: 2, entryUnitClass: "COUNT", displayQuantity: 2, displayUnit: "each" })],
      pantry([]),
      3, // factor must NOT scale the mirror
    );
    expect(plans[0].mirrorQuantityCanonical).toBe(710);
  });
});

describe("mirrorNutritionPerCanonicalUnit", () => {
  it("divides per-reference values by the class reference; null sodium becomes 0", () => {
    expect(mirrorNutritionPerCanonicalUnit(fanta)).toEqual({
      caloriesKcal: 0.42,
      proteinG: 0,
      carbsG: 0.11,
      fatG: 0,
      sodiumMg: 0,
    });
    expect(mirrorNutritionPerCanonicalUnit(flour).caloriesKcal).toBeCloseTo(3.64, 10);
  });
});

describe("canonicalUnitForClass", () => {
  it("maps classes to their canonical unit strings", () => {
    expect(canonicalUnitForClass("MASS")).toBe("g");
    expect(canonicalUnitForClass("VOLUME")).toBe("mL");
    expect(canonicalUnitForClass("COUNT")).toBe("each");
  });
});
