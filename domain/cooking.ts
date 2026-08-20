/**
 * Cook-flow math (openspec: cook-recipe-into-meals). Pure, framework-free.
 * Plans pantry consumption for cooking a recipe at a portion factor, and
 * derives the per-canonical-unit nutrition the service mirror needs
 * (dionysus-service treats ingredient nutrition as "per 1 unit of the
 * line's quantity" — RecipeNutrition.scala).
 */
import { REFERENCE_QUANTITY_BY_CLASS, type UnitClass } from "@/domain/types";
import { resolveQuantityForComparison } from "@/domain/units";

export interface CookLineIngredient {
  id: number;
  name: string;
  unitClass: UnitClass;
  densityGPerMl: number | null;
  packageQuantity?: number | null;
  packageUnit?: string | null;
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
  sodiumMgPerRef: number | null;
  saturatedFatGPerRef?: number | null;
  transFatGPerRef?: number | null;
  cholesterolMgPerRef?: number | null;
}

export interface CookLine {
  id: number;
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  displayQuantity: number;
  displayUnit: string;
  ingredient: CookLineIngredient;
}

export interface CookPantryRow {
  id: number;
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: UnitClass;
}

export type CookLineStatus = "ok" | "insufficient" | "missing" | "unresolved";

export interface CookLinePlan {
  lineId: number;
  ingredientId: number;
  ingredientName: string;
  status: CookLineStatus;
  /** Scaled requirement resolved into the pantry row's basis; null when
   * missing/unresolved. */
  requiredInPantryBasis: number | null;
  pantryItemId: number | null;
  availableInPantryBasis: number | null;
  /** Canonical-in-ingredient-class quantity for the service mirror; null
   * when the line cannot resolve into its ingredient's class. */
  mirrorQuantityCanonical: number | null;
}

/**
 * Per-line consumption plan at `factor` (portions / authored servings).
 * Statuses: ok (stock covers), insufficient (consumes to zero, flagged),
 * missing (no pantry row), unresolved (cannot compare units). Never
 * throws, never guesses.
 */
export function planCookConsumption(
  lines: CookLine[],
  pantryRowsByIngredientId: Map<number, CookPantryRow>,
  factor: number,
): CookLinePlan[] {
  return lines.map((line) => {
    const scaledCanonical = line.quantityCanonical * factor;
    const { ingredient } = line;

    // The mirror uses AUTHORED (unscaled) lines — design D2.
    const mirrorResolved = resolveQuantityForComparison(
      line.quantityCanonical,
      line.entryUnitClass,
      ingredient.unitClass,
      ingredient.densityGPerMl,
      ingredient.packageQuantity ?? null,
      ingredient.packageUnit ?? null,
    );
    const mirrorQuantityCanonical = mirrorResolved === "UNRESOLVED" ? null : mirrorResolved;

    const base = {
      lineId: line.id,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      mirrorQuantityCanonical,
    };

    const pantryRow = pantryRowsByIngredientId.get(ingredient.id);
    if (!pantryRow) {
      return { ...base, status: "missing" as const, requiredInPantryBasis: null, pantryItemId: null, availableInPantryBasis: null };
    }

    const required = resolveQuantityForComparison(
      scaledCanonical,
      line.entryUnitClass,
      pantryRow.entryUnitClass,
      ingredient.densityGPerMl,
      ingredient.packageQuantity ?? null,
      ingredient.packageUnit ?? null,
    );
    if (required === "UNRESOLVED") {
      return { ...base, status: "unresolved" as const, requiredInPantryBasis: null, pantryItemId: pantryRow.id, availableInPantryBasis: null };
    }

    return {
      ...base,
      status: pantryRow.quantityCanonical >= required ? ("ok" as const) : ("insufficient" as const),
      requiredInPantryBasis: required,
      pantryItemId: pantryRow.id,
      availableInPantryBasis: pantryRow.quantityCanonical,
    };
  });
}

export interface MirrorNutrition {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sodiumMg: number;
  /** openspec: meal-micronutrients — sparse, ÷REF like the macros. */
  micronutrients: Record<string, number>;
}

/** Nutrition per 1 canonical unit of the ingredient's class (perRef ÷ REF).
 * Null sodium mirrors as 0 — the service's fields are non-null (design D2,
 * documented fidelity loss). */
export function mirrorNutritionPerCanonicalUnit(
  ingredient: CookLineIngredient,
  micronutrients: Array<{ key: string; amountPerRef: number }> = [],
): MirrorNutrition {
  const ref = REFERENCE_QUANTITY_BY_CLASS[ingredient.unitClass];
  return {
    caloriesKcal: ingredient.caloriesPerRef / ref,
    proteinG: ingredient.proteinPerRef / ref,
    carbsG: ingredient.carbsPerRef / ref,
    fatG: ingredient.fatPerRef / ref,
    sodiumMg: (ingredient.sodiumMgPerRef ?? 0) / ref,
    micronutrients: {
      ...Object.fromEntries(micronutrients.map((entry) => [entry.key, entry.amountPerRef / ref])),
      // openspec: expanded-nutrients — first-class planner fields ride the
      // free-form map so service day rollups include them.
      ...(ingredient.saturatedFatGPerRef != null
        ? { saturatedFatG: ingredient.saturatedFatGPerRef / ref }
        : {}),
      ...(ingredient.transFatGPerRef != null ? { transFatG: ingredient.transFatGPerRef / ref } : {}),
      ...(ingredient.cholesterolMgPerRef != null
        ? { cholesterolMg: ingredient.cholesterolMgPerRef / ref }
        : {}),
    },
  };
}

/** The canonical unit string the service mirror lines use. */
export function canonicalUnitForClass(unitClass: UnitClass): string {
  switch (unitClass) {
    case "MASS":
      return "g";
    case "VOLUME":
      return "mL";
    case "COUNT":
      return "each";
  }
}
