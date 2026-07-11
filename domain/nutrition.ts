/**
 * Recipe nutrition computation (architecture.md §4, §6 Flow B).
 * Pure, framework-free — no imports from next/*, react, drizzle-orm, or
 * better-sqlite3 (ESLint-enforced, see eslint.config.mjs).
 *
 * Traces to FR-17, FR-18, FR-19 / NFR-7 and
 * docs/stories/S-103-domain-nutrition.md.
 */

import { resolveQuantityForComparison } from "./units";
import { REFERENCE_QUANTITY_BY_CLASS } from "./types";
import type { UnitClass } from "./types";

/**
 * A recipe line's nutrition-relevant shape. `quantityCanonical` is already
 * canonical (g/mL/each) per architecture §4; `entryUnitClass` may differ
 * from the constituent ingredient's primary `unitClass`.
 */
export interface RecipeLine {
  id: number;
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: UnitClass;
}

/**
 * An ingredient's nutrition profile, expressed per
 * REFERENCE_QUANTITY_BY_CLASS[unitClass] (architecture §4). Required macro
 * fields are always numbers; optional fields are `null` when absent (A-1) —
 * never a stand-in zero.
 */
export interface NutritionIngredient {
  id: number;
  unitClass: UnitClass;
  densityGPerMl: number | null;
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
  fiberPerRef: number | null;
  sugarPerRef: number | null;
  sodiumMgPerRef: number | null;
}

/** A recipe as consumed by computeRecipeNutrition(). */
export interface NutritionRecipe {
  id: number;
  servings: number;
  lines: RecipeLine[];
}

/**
 * A single nutrient's computed value. Invariant: `incomplete === true` iff
 * `value === null`. A legitimately-computed zero is `{ value: 0, incomplete:
 * false }` — structurally distinct from an incomplete field (FR-19).
 */
export interface NutrientTotal {
  value: number | null;
  incomplete: boolean;
}

export interface NutritionTotals {
  calories: NutrientTotal;
  protein: NutrientTotal;
  carbs: NutrientTotal;
  fat: NutrientTotal;
  fiber: NutrientTotal;
  sugar: NutrientTotal;
  sodiumMg: NutrientTotal;
}

export interface RecipeNutrition {
  totals: NutritionTotals;
  perServing: NutritionTotals;
  servings: number;
  /** ids of lines whose quantity resolved to 'UNRESOLVED' */
  unresolvedLineIds: number[];
}

const REQUIRED_KEYS = ["calories", "protein", "carbs", "fat"] as const;
const OPTIONAL_KEYS = ["fiber", "sugar", "sodiumMg"] as const;

const REQUIRED_FIELD_BY_KEY: Record<
  (typeof REQUIRED_KEYS)[number],
  "caloriesPerRef" | "proteinPerRef" | "carbsPerRef" | "fatPerRef"
> = {
  calories: "caloriesPerRef",
  protein: "proteinPerRef",
  carbs: "carbsPerRef",
  fat: "fatPerRef",
};

const OPTIONAL_FIELD_BY_KEY: Record<
  (typeof OPTIONAL_KEYS)[number],
  "fiberPerRef" | "sugarPerRef" | "sodiumMgPerRef"
> = {
  fiber: "fiberPerRef",
  sugar: "sugarPerRef",
  sodiumMg: "sodiumMgPerRef",
};

function nutrientTotal(value: number | null): NutrientTotal {
  return { value, incomplete: value === null };
}

/**
 * Computes a recipe's nutrition totals and per-serving values from its
 * lines and constituent ingredient profiles (architecture §6 Flow B).
 *
 * - Reference basis for scaling is always the ingredient's PRIMARY
 *   `unitClass`, never the line's `entryUnitClass` (architecture §4).
 * - A line whose quantity resolves to 'UNRESOLVED' (FR-11) contributes to
 *   NO totals and flags every required macro total incomplete (FR-19); its
 *   id is collected in `unresolvedLineIds`.
 * - Optional fields (fiber/sugar/sodiumMg) sum to a completed total only
 *   when present (non-null) on every constituent ingredient; otherwise the
 *   total is incomplete/null (FR-17/FR-19).
 * - Full precision is carried internally — rounding is a display-boundary
 *   concern only (NFR-7), see `formatNutritionForDisplay`.
 */
export function computeRecipeNutrition(
  recipe: NutritionRecipe,
  ingredientsById: Record<number, NutritionIngredient>,
): RecipeNutrition {
  const requiredSums: Record<(typeof REQUIRED_KEYS)[number], number> = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
  const optionalSums: Record<(typeof OPTIONAL_KEYS)[number], number> = {
    fiber: 0,
    sugar: 0,
    sodiumMg: 0,
  };
  // Optional field is only a completed total if EVERY constituent
  // ingredient (across all lines) has it set (non-null).
  const optionalPresentForAll: Record<(typeof OPTIONAL_KEYS)[number], boolean> = {
    fiber: true,
    sugar: true,
    sodiumMg: true,
  };

  const unresolvedLineIds: number[] = [];
  let anyUnresolved = false;

  for (const line of recipe.lines) {
    const ingredient = ingredientsById[line.ingredientId];

    const resolvedQuantity = resolveQuantityForComparison(
      line.quantityCanonical,
      line.entryUnitClass,
      ingredient.unitClass,
      ingredient.densityGPerMl,
    );

    if (resolvedQuantity === "UNRESOLVED") {
      unresolvedLineIds.push(line.id);
      anyUnresolved = true;
      continue;
    }

    const scale =
      resolvedQuantity / REFERENCE_QUANTITY_BY_CLASS[ingredient.unitClass];

    for (const key of REQUIRED_KEYS) {
      requiredSums[key] += ingredient[REQUIRED_FIELD_BY_KEY[key]] * scale;
    }

    for (const key of OPTIONAL_KEYS) {
      const fieldValue = ingredient[OPTIONAL_FIELD_BY_KEY[key]];
      if (fieldValue === null) {
        optionalPresentForAll[key] = false;
      } else {
        optionalSums[key] += fieldValue * scale;
      }
    }
  }

  const totals: NutritionTotals = {
    calories: nutrientTotal(anyUnresolved ? null : requiredSums.calories),
    protein: nutrientTotal(anyUnresolved ? null : requiredSums.protein),
    carbs: nutrientTotal(anyUnresolved ? null : requiredSums.carbs),
    fat: nutrientTotal(anyUnresolved ? null : requiredSums.fat),
    fiber: nutrientTotal(optionalPresentForAll.fiber ? optionalSums.fiber : null),
    sugar: nutrientTotal(optionalPresentForAll.sugar ? optionalSums.sugar : null),
    sodiumMg: nutrientTotal(
      optionalPresentForAll.sodiumMg ? optionalSums.sodiumMg : null,
    ),
  };

  const perServing: NutritionTotals = {
    calories: nutrientTotal(
      totals.calories.value === null ? null : totals.calories.value / recipe.servings,
    ),
    protein: nutrientTotal(
      totals.protein.value === null ? null : totals.protein.value / recipe.servings,
    ),
    carbs: nutrientTotal(
      totals.carbs.value === null ? null : totals.carbs.value / recipe.servings,
    ),
    fat: nutrientTotal(
      totals.fat.value === null ? null : totals.fat.value / recipe.servings,
    ),
    fiber: nutrientTotal(
      totals.fiber.value === null ? null : totals.fiber.value / recipe.servings,
    ),
    sugar: nutrientTotal(
      totals.sugar.value === null ? null : totals.sugar.value / recipe.servings,
    ),
    sodiumMg: nutrientTotal(
      totals.sodiumMg.value === null ? null : totals.sodiumMg.value / recipe.servings,
    ),
  };

  return {
    totals,
    perServing,
    servings: recipe.servings,
    unresolvedLineIds,
  };
}

/**
 * Formats a nutrient value for display (architecture §6 Flow B's rounding
 * boundary — NFR-7). Rounding happens ONLY here, never inside
 * `computeRecipeNutrition`.
 *
 * - `null` -> "N/A" (never a rounded number standing in for "incomplete").
 * - `'kcal'` -> rounds to the nearest whole number, e.g. "457 kcal".
 * - `'g'` / `'mg'` -> rounds to one decimal place, e.g. "12.3 g" / "5.0 mg".
 */
export function formatNutritionForDisplay(
  value: number | null,
  kind: "kcal" | "g" | "mg",
): string {
  if (value === null) {
    return "N/A";
  }

  if (kind === "kcal") {
    return `${Math.round(value)} kcal`;
  }

  return `${value.toFixed(1)} ${kind}`;
}
