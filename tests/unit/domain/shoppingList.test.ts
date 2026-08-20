import { describe, expect, it } from "vitest";
import { buildShoppingList, shoppingListText } from "@/domain/shoppingList";
import type { CookLine } from "@/domain/cooking";
import type { DepletableRow, PlannedConsumption } from "@/domain/planner";

/** openspec: shopping-list — sequential shortfall aggregation. */

const juice = {
  id: 11,
  name: "Juice",
  unitClass: "VOLUME" as const,
  densityGPerMl: null,
  caloriesPerRef: 47,
  proteinPerRef: 0.7,
  carbsPerRef: 10.8,
  fatPerRef: 0.2,
  sodiumMgPerRef: null,
};
const tahini = {
  id: 12,
  name: "Tahini",
  unitClass: "MASS" as const,
  densityGPerMl: null,
  caloriesPerRef: 595,
  proteinPerRef: 17,
  carbsPerRef: 21,
  fatPerRef: 54,
  sodiumMgPerRef: null,
};

function line(id: number, ingredient: typeof juice | typeof tahini, quantityCanonical: number, entryUnitClass: "MASS" | "VOLUME" | "COUNT", displayUnit: string): CookLine {
  return { id, quantityCanonical, entryUnitClass, displayQuantity: quantityCanonical, displayUnit, ingredient };
}

function plannedSmoothie(portions: number): PlannedConsumption {
  return { servings: 1, portions, lines: [line(1, juice, 300, "VOLUME", "mL")] };
}

describe("buildShoppingList", () => {
  const pantry: DepletableRow[] = [{ id: 1, ingredientId: 11, quantityCanonical: 400, entryUnitClass: "VOLUME" }];

  it("two smoothies against 400 mL of juice → buy 200 mL", () => {
    const list = buildShoppingList(pantry, [plannedSmoothie(1), plannedSmoothie(1)]);
    expect(list.items).toEqual([{ ingredientId: 11, name: "Juice", quantity: 200, unit: "mL" }]);
    expect(list.unresolved).toEqual([]);
  });

  it("a covered week buys nothing; input rows untouched", () => {
    const list = buildShoppingList(pantry, [plannedSmoothie(1)]);
    expect(list.items).toEqual([]);
    expect(pantry[0].quantityCanonical).toBe(400);
  });

  it("a wholly-missing ingredient lands in its canonical unit, portions-scaled", () => {
    const list = buildShoppingList(pantry, [
      { servings: 2, portions: 4, lines: [line(1, tahini, 125, "MASS", "g")] },
    ]);
    expect(list.items).toEqual([{ ingredientId: 12, name: "Tahini", quantity: 250, unit: "g" }]);
  });

  it("shortfalls aggregate across entries for the same ingredient", () => {
    const list = buildShoppingList(pantry, [plannedSmoothie(1), plannedSmoothie(1), plannedSmoothie(1)]);
    expect(list.items).toEqual([{ ingredientId: 11, name: "Juice", quantity: 500, unit: "mL" }]);
  });

  it("unresolvable lines are named, not guessed", () => {
    // MASS line on a VOLUME pantry row, no density: consumption is unresolved.
    const list = buildShoppingList(pantry, [
      { servings: 1, portions: 1, lines: [line(1, { ...juice, densityGPerMl: null, unitClass: "VOLUME" as const }, 100, "MASS", "g")] },
    ]);
    expect(list.items).toEqual([]);
    expect(list.unresolved).toEqual(["Juice"]);
  });
});

describe("shoppingListText", () => {
  it("renders items and unresolved notes as plain lines", () => {
    expect(
      shoppingListText({
        items: [{ ingredientId: 11, name: "Juice", quantity: 200, unit: "mL" }],
        unresolved: ["Mystery"],
      }),
    ).toBe("- Juice: 200 mL\n- Mystery: check recipe (units unresolved)");
  });
});
