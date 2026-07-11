import { describe, expect, it } from "vitest";
import {
  computeRecipeNutrition,
  formatNutritionForDisplay,
} from "@/domain/nutrition";
import type { UnitClass } from "@/domain/types";

/**
 * S-103: domain nutrition computation.
 *
 * Traces to docs/stories/S-103-domain-nutrition.md AC1-AC6 and
 * architecture.md §4 (nutrition fields per reference basis,
 * REFERENCE_QUANTITY_BY_CLASS), §6 Flow B (computation steps, rounding
 * boundary). Covers FR-17, FR-18, FR-19 / NFR-7.
 *
 * `/domain/nutrition.ts` does not exist yet — this suite is intentionally
 * red until the implementer builds `computeRecipeNutrition()` and
 * `formatNutritionForDisplay()` per architecture.md §5's stated shape:
 * `computeRecipeNutrition(recipe, ingredientsById) -> totals + per-serving
 * + incomplete flags`.
 *
 * ---------------------------------------------------------------------
 * CONTRACT ASSUMED BY THIS SUITE (this is the implementer's spec — see
 * handoff notes for rationale on each choice):
 *
 * type TestIngredient = {
 *   id: number;
 *   unitClass: UnitClass;             // PRIMARY class — nutrition reference basis
 *   densityGPerMl: number | null;     // FR-12
 *   caloriesPerRef: number;           // required (FR-2), per REFERENCE_QUANTITY_BY_CLASS[unitClass]
 *   proteinPerRef: number;            // required
 *   carbsPerRef: number;              // required
 *   fatPerRef: number;                // required
 *   fiberPerRef: number | null;       // optional (A-1) — null means "field absent", NOT zero
 *   sugarPerRef: number | null;       // optional
 *   sodiumMgPerRef: number | null;    // optional
 * };
 *
 * type TestRecipeLine = {
 *   id: number;
 *   ingredientId: number;
 *   quantityCanonical: number;        // already canonical (g/mL/each) per architecture §4
 *   entryUnitClass: UnitClass;        // may differ from the ingredient's primary unitClass
 * };
 *
 * type TestRecipe = {
 *   id: number;
 *   servings: number;
 *   lines: TestRecipeLine[];
 * };
 *
 * ingredientsById: Record<number, TestIngredient>  (plain object keyed by
 * ingredient id — matches the "ingredientsById" naming in architecture §5).
 *
 * Return shape of computeRecipeNutrition():
 *
 * type NutrientTotal = { value: number | null; incomplete: boolean };
 *   Invariant: incomplete === true  <=> value === null.
 *   A legitimately-computed zero is { value: 0, incomplete: false } —
 *   structurally distinct from an incomplete field (FR-19).
 *
 * type NutritionTotals = {
 *   calories: NutrientTotal;
 *   protein: NutrientTotal;
 *   carbs: NutrientTotal;
 *   fat: NutrientTotal;
 *   fiber: NutrientTotal;
 *   sugar: NutrientTotal;
 *   sodiumMg: NutrientTotal;
 * };
 *
 * type RecipeNutrition = {
 *   totals: NutritionTotals;
 *   perServing: NutritionTotals;
 *   servings: number;
 *   unresolvedLineIds: number[];   // ids of lines that resolved to 'UNRESOLVED'
 * };
 *
 * formatNutritionForDisplay(value: number | null, kind: 'kcal' | 'g' | 'mg'): string
 *   - null   -> "N/A" (never a rounded number standing in for "incomplete")
 *   - 'kcal' -> rounds to the nearest whole number, e.g. "457 kcal"
 *   - 'g'/'mg' -> rounds to one decimal place, e.g. "12.3 g" / "12.3 mg"
 * ---------------------------------------------------------------------
 */

/** Relative-tolerance assertion: |actual - expected| / |expected| <= tolerance. */
function expectWithinRelativeTolerance(
  actual: number,
  expected: number,
  tolerance: number,
) {
  const relativeError = Math.abs(actual - expected) / Math.abs(expected);
  expect(
    relativeError,
    `expected ${actual} to be within ${tolerance * 100}% of ${expected} (relative error was ${(relativeError * 100).toFixed(3)}%)`,
  ).toBeLessThanOrEqual(tolerance);
}

const FR17_TOLERANCE = 0.005; // FR-17/NFR-7: 0.5% pre-rounding tolerance
const FR12_TOLERANCE = 0.05; // FR-12: density-path 5% tolerance

// ---------------------------------------------------------------------
// Fixture ingredients
// ---------------------------------------------------------------------

/** MASS-primary, per-100g basis. No optional fields (fiber/sugar/sodium absent). */
const CHICKEN_BREAST = {
  id: 1,
  unitClass: "MASS" as UnitClass,
  densityGPerMl: null,
  caloriesPerRef: 165,
  proteinPerRef: 31,
  carbsPerRef: 0,
  fatPerRef: 3.6,
  fiberPerRef: null,
  sugarPerRef: null,
  sodiumMgPerRef: null,
};

/** COUNT-primary, per-each basis. No optional fields. */
const EGG = {
  id: 2,
  unitClass: "COUNT" as UnitClass,
  densityGPerMl: null,
  caloriesPerRef: 78,
  proteinPerRef: 6.3,
  carbsPerRef: 0.6,
  fatPerRef: 5.3,
  fiberPerRef: null,
  sugarPerRef: null,
  sodiumMgPerRef: null,
};

/** MASS-primary, per-100g basis, has fiber/sugar/sodium set (including a legitimate 0 for sugar). */
const RICE = {
  id: 3,
  unitClass: "MASS" as UnitClass,
  densityGPerMl: null,
  caloriesPerRef: 130,
  proteinPerRef: 2.7,
  carbsPerRef: 28,
  fatPerRef: 0.3,
  fiberPerRef: 1.8,
  sugarPerRef: 0,
  sodiumMgPerRef: 5,
};

/** MASS-primary, per-100g basis, density set (FR-12 density conversion path). */
const FLOUR = {
  id: 4,
  unitClass: "MASS" as UnitClass,
  densityGPerMl: 0.53,
  caloriesPerRef: 364,
  proteinPerRef: 10,
  carbsPerRef: 76,
  fatPerRef: 1,
  fiberPerRef: null,
  sugarPerRef: null,
  sodiumMgPerRef: null,
};

/** Zero-calorie ingredient (e.g. water) — used to prove "legitimate zero" != "incomplete". */
const WATER = {
  id: 5,
  unitClass: "MASS" as UnitClass,
  densityGPerMl: null,
  caloriesPerRef: 0,
  proteinPerRef: 0,
  carbsPerRef: 0,
  fatPerRef: 0,
  fiberPerRef: 0,
  sugarPerRef: 0,
  sodiumMgPerRef: 0,
};

describe("computeRecipeNutrition — hand-calculated totals (AC1, FR-17)", () => {
  // Recipe: 200 g chicken breast + 2 each egg, servings = 4.
  //
  // Hand calculation (reference basis: chicken 100g, egg 1 each):
  //   chicken scale = 200 / 100 = 2
  //     calories = 165 * 2 = 330
  //     protein  = 31  * 2 = 62
  //     carbs    = 0   * 2 = 0
  //     fat      = 3.6 * 2 = 7.2
  //   egg scale = 2 / 1 = 2
  //     calories = 78  * 2 = 156
  //     protein  = 6.3 * 2 = 12.6
  //     carbs    = 0.6 * 2 = 1.2
  //     fat      = 5.3 * 2 = 10.6
  //   TOTALS: calories = 486, protein = 74.6, carbs = 1.2, fat = 17.8
  const recipe = {
    id: 100,
    servings: 4,
    lines: [
      { id: 1, ingredientId: 1, quantityCanonical: 200, entryUnitClass: "MASS" as UnitClass },
      { id: 2, ingredientId: 2, quantityCanonical: 2, entryUnitClass: "COUNT" as UnitClass },
    ],
  };
  const ingredientsById = { 1: CHICKEN_BREAST, 2: EGG };

  it("matches the hand calculation for calories/protein/carbs/fat within 0.5% pre-rounding", () => {
    const result = computeRecipeNutrition(recipe, ingredientsById);

    expect(result.totals.calories.incomplete).toBe(false);
    expect(result.totals.protein.incomplete).toBe(false);
    expect(result.totals.carbs.incomplete).toBe(false);
    expect(result.totals.fat.incomplete).toBe(false);

    expectWithinRelativeTolerance(result.totals.calories.value as number, 486, FR17_TOLERANCE);
    expectWithinRelativeTolerance(result.totals.protein.value as number, 74.6, FR17_TOLERANCE);
    // carbs: chicken 0*2=0, egg 0.6*2=1.2 -> total 1.2 (matches the fixture
    // hand-calc comment above; NOT 0 — chicken merely contributes nothing).
    expectWithinRelativeTolerance(result.totals.carbs.value as number, 1.2, FR17_TOLERANCE);
    expectWithinRelativeTolerance(result.totals.fat.value as number, 17.8, FR17_TOLERANCE);
  });

  it("carries full precision internally — is not pre-rounded to display precision (NFR-7)", () => {
    const result = computeRecipeNutrition(recipe, ingredientsById);
    // 486, 74.6, 17.8 are exact given these clean fixture numbers; the guard
    // here is that the function must not have rounded to fewer significant
    // digits than the inputs support (e.g. truncating 74.6 to 75).
    expect(result.totals.protein.value).toBeCloseTo(74.6, 10);
    expect(result.totals.fat.value).toBeCloseTo(17.8, 10);
  });
});

describe("computeRecipeNutrition — per-serving math (AC5/AC6 of story, FR-18)", () => {
  const recipe = {
    id: 100,
    servings: 4,
    lines: [
      { id: 1, ingredientId: 1, quantityCanonical: 200, entryUnitClass: "MASS" as UnitClass },
      { id: 2, ingredientId: 2, quantityCanonical: 2, entryUnitClass: "COUNT" as UnitClass },
    ],
  };
  const ingredientsById = { 1: CHICKEN_BREAST, 2: EGG };

  it("computes perServing = totals / servings at servings=4", () => {
    const result = computeRecipeNutrition(recipe, ingredientsById);
    expectWithinRelativeTolerance(result.perServing.calories.value as number, 486 / 4, FR17_TOLERANCE);
    expectWithinRelativeTolerance(result.perServing.protein.value as number, 74.6 / 4, FR17_TOLERANCE);
    expectWithinRelativeTolerance(result.perServing.fat.value as number, 17.8 / 4, FR17_TOLERANCE);
  });

  it("doubles perServing when servings changes 4 -> 2, without altering totals", () => {
    const recipeAtFourServings = recipe;
    const recipeAtTwoServings = { ...recipe, servings: 2 };

    const resultFour = computeRecipeNutrition(recipeAtFourServings, ingredientsById);
    const resultTwo = computeRecipeNutrition(recipeAtTwoServings, ingredientsById);

    // Totals unchanged by a servings change.
    expect(resultTwo.totals.calories.value).toBe(resultFour.totals.calories.value);
    expect(resultTwo.totals.protein.value).toBe(resultFour.totals.protein.value);
    expect(resultTwo.totals.fat.value).toBe(resultFour.totals.fat.value);

    // Per-serving doubles.
    expectWithinRelativeTolerance(
      resultTwo.perServing.calories.value as number,
      (resultFour.perServing.calories.value as number) * 2,
      FR17_TOLERANCE,
    );
    expectWithinRelativeTolerance(
      resultTwo.perServing.protein.value as number,
      (resultFour.perServing.protein.value as number) * 2,
      FR17_TOLERANCE,
    );
    expectWithinRelativeTolerance(
      resultTwo.perServing.fat.value as number,
      (resultFour.perServing.fat.value as number) * 2,
      FR17_TOLERANCE,
    );
  });
});

describe("computeRecipeNutrition — density conversion path (FR-12)", () => {
  // Recipe: a single line for FLOUR entered in VOLUME (240 mL, i.e. ~1 cup)
  // against flour's MASS-primary reference basis, density 0.53 g/mL.
  //   resolved mass = 240 mL * 0.53 g/mL = 127.2 g
  //   scale = 127.2 / 100 = 1.272
  //   calories = 364 * 1.272 = 463.008
  //   protein  = 10  * 1.272 = 12.72
  //   carbs    = 76  * 1.272 = 96.672
  //   fat      = 1   * 1.272 = 1.272
  const recipe = {
    id: 101,
    servings: 1,
    lines: [
      { id: 1, ingredientId: 4, quantityCanonical: 240, entryUnitClass: "VOLUME" as UnitClass },
    ],
  };
  const ingredientsById = { 4: FLOUR };

  it("density-converts the line to the ingredient's reference basis and contributes correctly, within 5%", () => {
    const result = computeRecipeNutrition(recipe, ingredientsById);

    expect(result.totals.calories.incomplete).toBe(false);
    expectWithinRelativeTolerance(result.totals.calories.value as number, 463.008, FR12_TOLERANCE);
    expectWithinRelativeTolerance(result.totals.protein.value as number, 12.72, FR12_TOLERANCE);
    expectWithinRelativeTolerance(result.totals.carbs.value as number, 96.672, FR12_TOLERANCE);
    expectWithinRelativeTolerance(result.totals.fat.value as number, 1.272, FR12_TOLERANCE);
  });
});

describe("computeRecipeNutrition — unresolved line never contributes 0, flags totals incomplete (AC3, FR-11/FR-19)", () => {
  // Recipe: 200 g chicken (resolves fine) + a RICE line entered as COUNT
  // (3 each) against rice's MASS-primary basis, no density set on rice ->
  // resolveQuantityForComparison returns 'UNRESOLVED' for COUNT vs MASS
  // regardless of density (per domain/units.ts).
  const recipe = {
    id: 102,
    servings: 2,
    lines: [
      { id: 1, ingredientId: 1, quantityCanonical: 200, entryUnitClass: "MASS" as UnitClass },
      { id: 2, ingredientId: 3, quantityCanonical: 3, entryUnitClass: "COUNT" as UnitClass },
    ],
  };
  const ingredientsById = { 1: CHICKEN_BREAST, 3: RICE };

  it("flags every required macro total as incomplete with value null — never a silent 0 or a wrong partial number", () => {
    const result = computeRecipeNutrition(recipe, ingredientsById);

    for (const key of ["calories", "protein", "carbs", "fat"] as const) {
      expect(result.totals[key].incomplete, `${key} should be incomplete`).toBe(true);
      expect(result.totals[key].value, `${key} value must be null, never 0`).toBeNull();
    }
  });

  it("identifies the unresolved line's id in the result", () => {
    const result = computeRecipeNutrition(recipe, ingredientsById);
    expect(result.unresolvedLineIds).toContain(2);
    expect(result.unresolvedLineIds).not.toContain(1);
  });

  it("per-serving totals are also flagged incomplete (never derived from a null/0 total)", () => {
    const result = computeRecipeNutrition(recipe, ingredientsById);
    for (const key of ["calories", "protein", "carbs", "fat"] as const) {
      expect(result.perServing[key].incomplete).toBe(true);
      expect(result.perServing[key].value).toBeNull();
    }
  });
});

describe("computeRecipeNutrition — optional field (fiber/sugar/sodium) presence semantics (AC4, FR-17/FR-19)", () => {
  it("flags fiber incomplete when only one constituent ingredient has it set (chicken has none, rice has 1.8)", () => {
    const recipe = {
      id: 103,
      servings: 1,
      lines: [
        { id: 1, ingredientId: 1, quantityCanonical: 100, entryUnitClass: "MASS" as UnitClass },
        { id: 2, ingredientId: 3, quantityCanonical: 100, entryUnitClass: "MASS" as UnitClass },
      ],
    };
    const ingredientsById = { 1: CHICKEN_BREAST, 3: RICE };

    const result = computeRecipeNutrition(recipe, ingredientsById);

    expect(result.totals.fiber.incomplete).toBe(true);
    expect(result.totals.fiber.value).toBeNull();

    // Required macros must still be complete — this is purely an
    // optional-field gap, not an unresolved-line problem.
    expect(result.totals.calories.incomplete).toBe(false);
  });

  it("computes fiber total when every constituent ingredient has it set (both ingredients report fiber)", () => {
    const CHICKEN_WITH_FIBER = { ...CHICKEN_BREAST, fiberPerRef: 0 };
    const recipe = {
      id: 104,
      servings: 1,
      lines: [
        { id: 1, ingredientId: 1, quantityCanonical: 100, entryUnitClass: "MASS" as UnitClass },
        { id: 2, ingredientId: 3, quantityCanonical: 100, entryUnitClass: "MASS" as UnitClass },
      ],
    };
    const ingredientsById = { 1: CHICKEN_WITH_FIBER, 3: RICE };

    // Hand calc: chicken fiber 0*1 + rice fiber 1.8*1 = 1.8
    const result = computeRecipeNutrition(recipe, ingredientsById);

    expect(result.totals.fiber.incomplete).toBe(false);
    expectWithinRelativeTolerance(result.totals.fiber.value as number, 1.8, FR17_TOLERANCE);
  });

  it("distinguishes a legitimate zero (sugarPerRef: 0 present) from a missing field (null) for sodium vs sugar", () => {
    // RICE has sugarPerRef: 0 (a real, present value) and sodiumMgPerRef: 5.
    // CHICKEN_BREAST has both sugarPerRef and sodiumMgPerRef as null (absent).
    const recipe = {
      id: 105,
      servings: 1,
      lines: [
        { id: 1, ingredientId: 1, quantityCanonical: 100, entryUnitClass: "MASS" as UnitClass },
        { id: 2, ingredientId: 3, quantityCanonical: 100, entryUnitClass: "MASS" as UnitClass },
      ],
    };
    const ingredientsById = { 1: CHICKEN_BREAST, 3: RICE };

    const result = computeRecipeNutrition(recipe, ingredientsById);

    // sugar/sodium are incomplete overall because CHICKEN_BREAST is missing
    // them — this is not about rice's own 0, it's the cross-ingredient
    // "present on every constituent ingredient" rule.
    expect(result.totals.sugar.incomplete).toBe(true);
    expect(result.totals.sugar.value).toBeNull();
    expect(result.totals.sodiumMg.incomplete).toBe(true);
    expect(result.totals.sodiumMg.value).toBeNull();
  });

  it("a recipe of only zero-value ingredients legitimately totals 0 and is NOT incomplete (FR-19 zero-vs-incomplete)", () => {
    const recipe = {
      id: 106,
      servings: 1,
      lines: [
        { id: 1, ingredientId: 5, quantityCanonical: 100, entryUnitClass: "MASS" as UnitClass },
        { id: 2, ingredientId: 5, quantityCanonical: 50, entryUnitClass: "MASS" as UnitClass },
      ],
    };
    const ingredientsById = { 5: WATER };

    const result = computeRecipeNutrition(recipe, ingredientsById);

    for (const key of ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sodiumMg"] as const) {
      expect(result.totals[key].incomplete, `${key} should NOT be incomplete`).toBe(false);
      expect(result.totals[key].value, `${key} should be exactly 0, not null`).toBe(0);
    }
  });
});

describe("formatNutritionForDisplay — rounding is a display-boundary concern only (AC6, NFR-7)", () => {
  it('rounds a macro gram value to one decimal place: 12.34999 -> "12.3 g"', () => {
    expect(formatNutritionForDisplay(12.34999, "g")).toBe("12.3 g");
  });

  it('rounds calories to a whole number: 456.7 -> "457 kcal"', () => {
    expect(formatNutritionForDisplay(456.7, "kcal")).toBe("457 kcal");
  });

  it('rounds a milligram sodium value to one decimal place: 4.98 -> "5.0 mg"', () => {
    expect(formatNutritionForDisplay(4.98, "mg")).toBe("5.0 mg");
  });

  it('renders an incomplete (null) value as "N/A", never as a rounded number standing in for missing data', () => {
    expect(formatNutritionForDisplay(null, "kcal")).toBe("N/A");
    expect(formatNutritionForDisplay(null, "g")).toBe("N/A");
  });

  it('renders a legitimate zero distinctly from "N/A": 0 -> "0 kcal", not "N/A"', () => {
    expect(formatNutritionForDisplay(0, "kcal")).toBe("0 kcal");
  });
});
