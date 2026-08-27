/**
 * openspec: planner-consume — the shared pantry-consumption core, split
 * out of eat-actions so the pantry Eat dialog and the planner's consume
 * transition run the identical service-first, all-or-nothing sequence:
 * mirror the product as a directly-loggable service ingredient, log the
 * meal, THEN decrement the pantry. Callers own their own plan-entry
 * bookkeeping (append an eat_item vs mark an existing entry consumed).
 */
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { getIngredientMicronutrients } from "@/data/ingredients";
import { consumeFromPantry, getIngredientRecordById, getPantryItemRecordById } from "@/data/pantry";
import { canonicalUnitForClass, mirrorNutritionPerCanonicalUnit } from "@/domain/cooking";
import { resolveQuantityForComparison, toCanonical } from "@/domain/units";
import {
  createIngredient as serviceCreateIngredient,
  createMeal as serviceCreateMeal,
  listIngredients as serviceListIngredients,
  updateIngredient as serviceUpdateIngredient,
} from "@/services/dionysusService";

export interface PantryConsumptionError {
  code: "NOT_FOUND" | "VALIDATION_ERROR" | "SERVICE_ERROR";
  message: string;
}

export type PantryConsumptionResult =
  | { ok: true; consumed: number; ingredientName: string }
  | { ok: false; error: PantryConsumptionError };

/** Backdated logs land at noon UTC of that day — inside the local
 * calendar day for any timezone west of UTC+12. */
export function eatenAtForDate(logDate: string, today: string): string {
  return logDate === today ? new Date().toISOString() : `${logDate}T12:00:00.000Z`;
}

export async function performPantryConsumption(input: {
  pantryItemId: number;
  quantity: number;
  unit: string;
  logDate: string;
  today: string;
}): Promise<PantryConsumptionResult> {
  const { pantryItemId, quantity, unit, logDate, today } = input;

  const row = await getPantryItemRecordById(pantryItemId);
  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Pantry item not found." } };
  const ingredient = await getIngredientRecordById(row.ingredientId);
  if (!ingredient) return { ok: false, error: { code: "NOT_FOUND", message: "Product not found." } };
  if (!ingredient.readyToEat) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "This product isn't marked ready to eat." } };
  }

  let entered: { quantityCanonical: number; entryUnitClass: "MASS" | "VOLUME" | "COUNT" };
  try {
    entered = toCanonical(quantity, unit);
  } catch {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Unknown unit." } };
  }

  // The eaten amount in the ingredient's own class (for the service meal)
  // and in the pantry row's basis (for consumption).
  const inIngredientClass = resolveQuantityForComparison(
    entered.quantityCanonical,
    entered.entryUnitClass,
    ingredient.unitClass,
    ingredient.densityGPerMl,
    ingredient.packageQuantity,
    ingredient.packageUnit,
  );
  const inRowBasis = resolveQuantityForComparison(
    entered.quantityCanonical,
    entered.entryUnitClass,
    row.entryUnitClass,
    ingredient.densityGPerMl,
    ingredient.packageQuantity,
    ingredient.packageUnit,
  );
  if (inIngredientClass === "UNRESOLVED" || inRowBasis === "UNRESOLVED") {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "That quantity's unit can't be converted for this product." },
    };
  }

  // ---- Service first: mirror as directly loggable, then log the meal ----
  try {
    const baseUrl = resolveDionysusServiceUrl();
    const serviceIngredients = await serviceListIngredients(baseUrl);
    const existing = serviceIngredients.find((item) => item.name === ingredient.name && item.id !== null);
    let serviceIngredientId: number;
    if (!existing) {
      const micronutrients = await getIngredientMicronutrients(ingredient.id);
      const created = await serviceCreateIngredient(baseUrl, {
        name: ingredient.name,
        ...mirrorNutritionPerCanonicalUnit(ingredient, micronutrients),
        abvPercent: null,
        directlyLoggable: true,
      });
      serviceIngredientId = created.id as number;
    } else {
      serviceIngredientId = existing.id as number;
      if (!existing.directlyLoggable) {
        // Cook mirrors default to false — flip it so direct meals validate.
        await serviceUpdateIngredient(baseUrl, serviceIngredientId, { ...existing, directlyLoggable: true });
      }
    }

    await serviceCreateMeal(baseUrl, {
      eatenAt: eatenAtForDate(logDate, today),
      lines: [
        {
          lineType: "direct_consumable",
          ingredientId: serviceIngredientId,
          quantity: inIngredientClass,
          unit: canonicalUnitForClass(ingredient.unitClass),
        },
      ],
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "SERVICE_ERROR",
        message: error instanceof Error ? error.message : "dionysus-service call failed.",
      },
    };
  }

  // ---- Pantry second ----
  const [applied] = await consumeFromPantry([{ pantryItemId, amountInRowBasis: inRowBasis }]);
  return { ok: true, consumed: applied.consumed, ingredientName: ingredient.name };
}
