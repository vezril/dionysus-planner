"use server";

/**
 * openspec: pantry-quick-eat — eat a ready-to-eat product straight from
 * the pantry. Service-first, all-or-nothing: mirror the product as a
 * directly-loggable service ingredient, log the meal, THEN consume the
 * pantry and record today's eat_item plan entry.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { getIngredientMicronutrients } from "@/data/ingredients";
import { consumeFromPantry, getIngredientRecordById, getPantryItemRecordById } from "@/data/pantry";
import { addPlanEntryRecord } from "@/data/planner";
import { canonicalUnitForClass, mirrorNutritionPerCanonicalUnit } from "@/domain/cooking";
import { resolveQuantityForComparison, toCanonical } from "@/domain/units";
import {
  createIngredient as serviceCreateIngredient,
  createMeal as serviceCreateMeal,
  listIngredients as serviceListIngredients,
  updateIngredient as serviceUpdateIngredient,
} from "@/services/dionysusService";

export interface ActionError {
  code: string;
  message: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const schema = z.object({
  pantryItemId: z.number().int().positive(),
  quantity: z.number().gt(0),
  unit: z.string().min(1),
  // openspec: plan-pantry-backdate — log to an earlier day when the
  // eating was forgotten at the time. Defaults to today; never future.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((raw) => {
      const parsed = new Date(`${raw}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
    })
    .optional(),
});

export async function eatPantryItem(input: unknown): Promise<ActionResult<{ consumed: number }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Eat input failed validation." } };
  }
  const { pantryItemId, quantity, unit } = parsed.data;
  const timeZone = resolveDionysusTimezone();
  const today = todayIsoDateIn(timeZone);
  const logDate = parsed.data.date ?? today;
  if (logDate > today) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Can't log to a future day." } };
  }

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
      // Backdated logs land at noon UTC of that day — inside the local
      // calendar day for any timezone west of UTC+12.
      eatenAt: logDate === today ? new Date().toISOString() : `${logDate}T12:00:00.000Z`,
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

  // ---- Pantry + planner second ----
  const [applied] = await consumeFromPantry([{ pantryItemId, amountInRowBasis: inRowBasis }]);
  await addPlanEntryRecord({
    date: logDate,
    kind: "eat_item",
    ingredientId: ingredient.id,
    recipeId: null,
    batchId: null,
    batchLabel: `${ingredient.name} (${quantity} ${unit})`,
    portions: 1,
  });

  revalidatePath("/pantry");
  revalidatePath("/planner");
  revalidatePath("/meal-log");
  return { ok: true, data: { consumed: applied.consumed } };
}
