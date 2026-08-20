import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  depletePantryByPlan,
  shiftWeek,
  weekDates,
  weekStartOf,
  type DepletableRow,
} from "@/domain/planner";
import type { CookLine } from "@/domain/cooking";

/** openspec: weekly-planner — week math, plan depletion, suggestion order. */

const flour = {
  id: 10,
  name: "Flour",
  unitClass: "MASS" as const,
  densityGPerMl: null,
  caloriesPerRef: 364,
  proteinPerRef: 10,
  carbsPerRef: 76,
  fatPerRef: 1,
  sodiumMgPerRef: null,
};
const milk = {
  id: 11,
  name: "Milk",
  unitClass: "VOLUME" as const,
  densityGPerMl: null,
  caloriesPerRef: 42,
  proteinPerRef: 3.4,
  carbsPerRef: 5,
  fatPerRef: 1,
  sodiumMgPerRef: null,
};

function line(id: number, ingredient: typeof flour | typeof milk, quantityCanonical: number, entryUnitClass: "MASS" | "VOLUME", displayUnit: string): CookLine {
  return { id, quantityCanonical, entryUnitClass, displayQuantity: quantityCanonical, displayUnit, ingredient };
}

function rows(): DepletableRow[] {
  return [
    { id: 1, ingredientId: 10, quantityCanonical: 500, entryUnitClass: "MASS" },
    { id: 2, ingredientId: 11, quantityCanonical: 1000, entryUnitClass: "VOLUME" },
  ];
}

describe("week math", () => {
  it("weekStartOf finds Monday (2026-08-20 is a Thursday)", () => {
    expect(weekStartOf("2026-08-20")).toBe("2026-08-17");
    expect(weekStartOf("2026-08-17")).toBe("2026-08-17");
    expect(weekStartOf("2026-08-23")).toBe("2026-08-17"); // Sunday belongs to the same week
  });

  it("weekDates spans Mon..Sun; shiftWeek moves whole weeks", () => {
    const dates = weekDates("2026-08-17");
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-08-17");
    expect(dates[6]).toBe("2026-08-23");
    expect(shiftWeek("2026-08-17", 1)).toBe("2026-08-24");
    expect(shiftWeek("2026-08-17", -1)).toBe("2026-08-10");
  });
});

describe("depletePantryByPlan", () => {
  it("deducts scaled requirements, floors at zero, leaves input untouched", () => {
    const input = rows();
    const depleted = depletePantryByPlan(input, [
      // Recipe of 2 servings planned at 4 portions: factor 2 → 400 g flour, 1200 mL milk (floors at 1000).
      { servings: 2, portions: 4, lines: [line(1, flour, 200, "MASS", "g"), line(2, milk, 600, "VOLUME", "mL")] },
    ]);
    expect(depleted.find((row) => row.ingredientId === 10)!.quantityCanonical).toBe(100);
    expect(depleted.find((row) => row.ingredientId === 11)!.quantityCanonical).toBe(0);
    expect(input.find((row) => row.ingredientId === 10)!.quantityCanonical).toBe(500);
  });

  it("entries compound across the week", () => {
    const depleted = depletePantryByPlan(rows(), [
      { servings: 1, portions: 1, lines: [line(1, flour, 200, "MASS", "g")] },
      { servings: 1, portions: 1, lines: [line(1, flour, 200, "MASS", "g")] },
    ]);
    expect(depleted.find((row) => row.ingredientId === 10)!.quantityCanonical).toBe(100);
  });
});

describe("buildSuggestions", () => {
  const recipes = [
    {
      id: 1,
      name: "Bread",
      lines: [
        { ingredientId: 10, quantityCanonical: 400, entryUnitClass: "MASS" as const, displayQuantity: 400, displayUnit: "g", ingredient: { unitClass: "MASS" as const, densityGPerMl: null } },
      ],
    },
    {
      id: 2,
      name: "Pancakes",
      lines: [
        { ingredientId: 11, quantityCanonical: 500, entryUnitClass: "VOLUME" as const, displayQuantity: 500, displayUnit: "mL", ingredient: { unitClass: "VOLUME" as const, densityGPerMl: null } },
      ],
    },
  ];
  const NOW = new Date("2026-08-20T18:00:00Z");

  it("cookable vs near reflects the depleted pantry", () => {
    const depleted: DepletableRow[] = [
      { id: 1, ingredientId: 10, quantityCanonical: 450, entryUnitClass: "MASS" },
      { id: 2, ingredientId: 11, quantityCanonical: 100, entryUnitClass: "VOLUME" },
    ];
    const suggestions = buildSuggestions({
      recipes,
      depletedRows: depleted,
      freshnessByIngredientId: new Map(),
      threshold: 3,
      now: NOW,
    });
    expect(suggestions.find((suggestion) => suggestion.name === "Bread")!.tier).toBe("cookable");
    expect(suggestions.find((suggestion) => suggestion.name === "Pancakes")!.tier).toBe("near");
  });

  it("expiring-users float to the top of their tier with the flag set", () => {
    const depleted: DepletableRow[] = [
      { id: 1, ingredientId: 10, quantityCanonical: 500, entryUnitClass: "MASS" },
      { id: 2, ingredientId: 11, quantityCanonical: 1000, entryUnitClass: "VOLUME" },
    ];
    const twelveDaysAgo = new Date(NOW.getTime() - 12 * 86_400_000).toISOString();
    const suggestions = buildSuggestions({
      recipes,
      depletedRows: depleted,
      freshnessByIngredientId: new Map([
        [11, { stockedAt: twelveDaysAgo, shelfLifeDays: 14 }], // milk expiring
      ]),
      threshold: 3,
      now: NOW,
    });
    expect(suggestions[0]).toMatchObject({ name: "Pancakes", tier: "cookable", usesExpiring: true });
    expect(suggestions[1]).toMatchObject({ name: "Bread", usesExpiring: false });
  });
});
