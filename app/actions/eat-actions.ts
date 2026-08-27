"use server";

/**
 * openspec: pantry-quick-eat — eat a ready-to-eat product straight from
 * the pantry. The service-first, all-or-nothing core lives in
 * app/lib/pantryConsumption.ts (openspec: planner-consume shares it);
 * this action adds the date guard and records the eat_item plan entry.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { performPantryConsumption } from "@/app/lib/pantryConsumption";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { getIngredientRecordById, getPantryItemRecordById } from "@/data/pantry";
import { addPlanEntryRecord } from "@/data/planner";

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

  // Resolved up front only for the plan-entry label below; the core
  // re-resolves and owns the existence/ready checks.
  const row = await getPantryItemRecordById(pantryItemId);
  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Pantry item not found." } };
  const ingredient = await getIngredientRecordById(row.ingredientId);
  if (!ingredient) return { ok: false, error: { code: "NOT_FOUND", message: "Product not found." } };

  const result = await performPantryConsumption({ pantryItemId, quantity, unit, logDate, today });
  if (!result.ok) return { ok: false, error: result.error };

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
  return { ok: true, data: { consumed: result.consumed } };
}
