/**
 * Cookable Now / Near-Match classification and ranking (architecture.md §4
 * "Matching algorithm's home", §6 Flow C). Pure, framework-free — no imports
 * from next/*, react, drizzle-orm, or better-sqlite3 (ESLint-enforced, see
 * eslint.config.mjs).
 *
 * Traces to FR-20, FR-21, FR-22, FR-24 / NFR-3 and
 * docs/stories/S-104-domain-matching.md.
 */

import { UNITS, resolveQuantityForComparison } from "./units";
import type { UnitClass } from "./types";

/** Flow C's pantry index: `Map<ingredientId, {qtyCanonical, class}>`. */
export interface PantryEntry {
  qtyCanonical: number;
  class: UnitClass;
}
export type PantryIndex = Map<number, PantryEntry>;

/**
 * A recipe line as consumed by matching. Carries its constituent
 * ingredient's `unitClass`/`densityGPerMl` inline (architecture §4 density
 * channel) — no separate ingredients lookup parameter.
 */
export interface RecipeLine {
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  displayQuantity: number;
  displayUnit: string;
  ingredient: { unitClass: UnitClass; densityGPerMl: number | null };
}

/** A recipe as consumed by computeCookableAndNearMatch(). */
export interface RecipeWithLines {
  id: number;
  name: string;
  lines: RecipeLine[];
}

/** Per-ingredient-ID unsatisfied attribution (story AC-8). */
export interface UnsatisfiedLine {
  ingredientId: number;
  status: "MISSING" | "INSUFFICIENT" | "UNRESOLVED";
  requiredCanonical: number;
  availableCanonical: number;
  shortfallDisplayQuantity: number;
  displayUnit: string;
  shortfallProportion: number;
}

/** A non-cookable recipe carrying its ranking-relevant detail. */
export interface RankedRecipe extends RecipeWithLines {
  unsatisfiedLines: UnsatisfiedLine[];
  meanShortfallProportion: number;
}

export interface MatchResult {
  cookable: RecipeWithLines[];
  nearMatch: RankedRecipe[];
  missingMoreCount: number;
}

/**
 * Builds the (at most) one UnsatisfiedLine for a group of same-ingredient
 * lines, or `null` when the pantry satisfies the aggregated requirement.
 *
 * Aggregation (AC-8): required quantities across duplicate lines for the
 * same ingredient ID are summed in the FIRST such line's `entryUnitClass`
 * canonical basis, resolving subsequent lines into that class via
 * `resolveQuantityForComparison` (using each line's own ingredient
 * density). A line that cannot be resolved into the first line's class
 * forces the whole group's status to UNRESOLVED — never guessed.
 *
 * Comparison direction (pinned by the test suite): the pantry's available
 * quantity is resolved INTO the first line's `entryUnitClass`, so
 * required/available/shortfall are always expressed in that line's own
 * canonical unit, directly convertible to its `displayUnit`.
 */
function evaluateIngredientGroup(
  lines: RecipeLine[],
  pantryEntry: PantryEntry | undefined,
): UnsatisfiedLine | null {
  const first = lines[0];

  let requiredCanonical = first.quantityCanonical;
  let groupUnresolved = false;

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const resolved = resolveQuantityForComparison(
      line.quantityCanonical,
      line.entryUnitClass,
      first.entryUnitClass,
      line.ingredient.densityGPerMl,
    );
    if (resolved === "UNRESOLVED") {
      groupUnresolved = true;
    } else {
      requiredCanonical += resolved;
    }
  }

  const displayUnit = first.displayUnit;
  const toCanonicalFactor = UNITS[displayUnit].toCanonicalFactor;
  const fullRequiredDisplayQuantity = requiredCanonical / toCanonicalFactor;

  if (groupUnresolved) {
    return {
      ingredientId: first.ingredientId,
      status: "UNRESOLVED",
      requiredCanonical,
      availableCanonical: 0,
      shortfallDisplayQuantity: fullRequiredDisplayQuantity,
      displayUnit,
      shortfallProportion: 1.0,
    };
  }

  if (!pantryEntry) {
    return {
      ingredientId: first.ingredientId,
      status: "MISSING",
      requiredCanonical,
      availableCanonical: 0,
      shortfallDisplayQuantity: fullRequiredDisplayQuantity,
      displayUnit,
      shortfallProportion: 1.0,
    };
  }

  const resolvedAvailable = resolveQuantityForComparison(
    pantryEntry.qtyCanonical,
    pantryEntry.class,
    first.entryUnitClass,
    first.ingredient.densityGPerMl,
  );

  if (resolvedAvailable === "UNRESOLVED") {
    return {
      ingredientId: first.ingredientId,
      status: "UNRESOLVED",
      requiredCanonical,
      availableCanonical: 0,
      shortfallDisplayQuantity: fullRequiredDisplayQuantity,
      displayUnit,
      shortfallProportion: 1.0,
    };
  }

  if (resolvedAvailable >= requiredCanonical) {
    return null;
  }

  const shortfallCanonical = requiredCanonical - resolvedAvailable;
  return {
    ingredientId: first.ingredientId,
    status: "INSUFFICIENT",
    requiredCanonical,
    availableCanonical: resolvedAvailable,
    shortfallDisplayQuantity: shortfallCanonical / toCanonicalFactor,
    displayUnit,
    shortfallProportion: shortfallCanonical / requiredCanonical,
  };
}

/** Groups a recipe's lines by ingredient ID, preserving first-seen order. */
function groupLinesByIngredient(lines: RecipeLine[]): RecipeLine[][] {
  const order: number[] = [];
  const groups = new Map<number, RecipeLine[]>();
  for (const line of lines) {
    const existing = groups.get(line.ingredientId);
    if (existing) {
      existing.push(line);
    } else {
      groups.set(line.ingredientId, [line]);
      order.push(line.ingredientId);
    }
  }
  return order.map((id) => groups.get(id) as RecipeLine[]);
}

/**
 * Classifies each recipe as Cookable Now or non-cookable, and ranks
 * non-cookable recipes into a threshold-bounded near-match list (FR-20,
 * FR-21, FR-22, FR-24). `threshold` is an explicit parameter — the domain
 * layer never reads `process.env` (architecture §4 OQ-1).
 */
export function computeCookableAndNearMatch(
  pantryIndex: PantryIndex,
  recipes: RecipeWithLines[],
  threshold: number,
): MatchResult {
  const cookable: RecipeWithLines[] = [];
  const ranked: RankedRecipe[] = [];
  let missingMoreCount = 0;

  for (const recipe of recipes) {
    const groups = groupLinesByIngredient(recipe.lines);
    const unsatisfiedLines: UnsatisfiedLine[] = [];

    for (const group of groups) {
      const pantryEntry = pantryIndex.get(group[0].ingredientId);
      const unsatisfied = evaluateIngredientGroup(group, pantryEntry);
      if (unsatisfied) {
        unsatisfiedLines.push(unsatisfied);
      }
    }

    if (unsatisfiedLines.length === 0) {
      cookable.push(recipe);
      continue;
    }

    if (unsatisfiedLines.length > threshold) {
      missingMoreCount += 1;
      continue;
    }

    const meanShortfallProportion =
      unsatisfiedLines.reduce((sum, line) => sum + line.shortfallProportion, 0) /
      unsatisfiedLines.length;

    ranked.push({ ...recipe, unsatisfiedLines, meanShortfallProportion });
  }

  ranked.sort((a, b) => {
    if (a.unsatisfiedLines.length !== b.unsatisfiedLines.length) {
      return a.unsatisfiedLines.length - b.unsatisfiedLines.length;
    }
    if (a.meanShortfallProportion !== b.meanShortfallProportion) {
      return a.meanShortfallProportion - b.meanShortfallProportion;
    }
    return a.name.localeCompare(b.name);
  });

  return { cookable, nearMatch: ranked, missingMoreCount };
}
