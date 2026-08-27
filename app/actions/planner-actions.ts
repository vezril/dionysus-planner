"use server";

/**
 * openspec: weekly-planner — plan-entry Server Actions, following the
 * ActionResult convention. Plans are planner-local; no service calls.
 */
import { revalidatePath } from "next/cache";
import { getIngredientRecordById } from "@/data/ingredients";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { eatenAtForDate, performPantryConsumption } from "@/app/lib/pantryConsumption";
import { getPantryItemByIngredientId } from "@/data/pantry";
import {
  addPlanEntryRecord,
  getPlanEntryRecordById,
  markPlanEntryConsumed,
  removePlanEntryRecord,
  type PlanEntryRecord,
} from "@/data/planner";
import { getRecipeDetail } from "@/data/recipes";
import { defaultPortionQuantity } from "@/domain/portioning";
import { planEntrySchema } from "@/domain/validation/planEntry.schema";
import { createMeal as serviceCreateMeal, listBatches, listRecipes } from "@/services/dionysusService";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export async function addPlanEntry(input: unknown): Promise<ActionResult<PlanEntryRecord>> {
  const parsed = planEntrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Plan entry failed validation.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }

  const data = parsed.data;
  if (data.kind === "cook") {
    const recipe = await getRecipeDetail(data.recipeId);
    if (!recipe) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Recipe not found." } };
    }
    const record = await addPlanEntryRecord({
      date: data.date,
      kind: "cook",
      recipeId: data.recipeId,
      batchId: null,
      batchLabel: null,
      portions: data.portions,
    });
    revalidatePath("/planner");
    return { ok: true, data: record };
  }

  // openspec: plan-pantry-backdate — plan a ready-to-eat pantry product
  // onto a day; nothing is consumed until it's actually eaten.
  if (data.kind === "eat_pantry") {
    const ingredient = await getIngredientRecordById(data.ingredientId);
    if (!ingredient) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Product not found." } };
    }
    if (!ingredient.readyToEat) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "That product isn't ready to consume." } };
    }
    const record = await addPlanEntryRecord({
      date: data.date,
      kind: "eat_pantry",
      ingredientId: data.ingredientId,
      recipeId: null,
      batchId: null,
      batchLabel: ingredient.name,
      portions: data.portions,
    });
    revalidatePath("/planner");
    return { ok: true, data: record };
  }

  // openspec: planner-ready-to-eat — batch entries validate against the
  // service (which is where the batch came from) and snapshot the label.
  try {
    const baseUrl = resolveDionysusServiceUrl();
    const [batches, recipes] = await Promise.all([listBatches(baseUrl), listRecipes(baseUrl)]);
    const batch = batches.find((candidate) => candidate.id === data.batchId);
    if (!batch) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Batch not found." } };
    }
    const label = recipes.find((candidate) => candidate.id === batch.recipeId)?.name ?? `Batch #${data.batchId}`;
    const record = await addPlanEntryRecord({
      date: data.date,
      kind: "eat_batch",
      recipeId: null,
      batchId: data.batchId,
      batchLabel: label,
      portions: data.portions,
    });
    revalidatePath("/planner");
    return { ok: true, data: record };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "SERVICE_ERROR",
        message: error instanceof Error ? error.message : "dionysus-service call failed.",
      },
    };
  }
}

/**
 * openspec: planner-consume — eat/drink a planned entry ON ITS OWN DAY.
 * Service-first, all-or-nothing: log the meal (batch portions drain the
 * recipe's batches oldest-first; pantry portions size by package/basis),
 * then flip consumedAt. Future-dated entries are refused.
 */
export async function consumePlanEntry(id: number): Promise<ActionResult<PlanEntryRecord>> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Bad plan entry id." } };
  }
  const entry = await getPlanEntryRecordById(id);
  if (!entry) return { ok: false, error: { code: "NOT_FOUND", message: "Plan entry not found." } };
  if (entry.kind !== "eat_batch" && entry.kind !== "eat_pantry") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Only planned batch or pantry meals can be consumed here." } };
  }
  if (entry.consumedAt !== null) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Already logged as eaten." } };
  }
  const today = todayIsoDateIn(resolveDionysusTimezone());
  if (entry.date > today) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Can't log a future day — wait until then or move the entry." } };
  }

  if (entry.kind === "eat_batch") {
    if (entry.batchId === null) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "Entry has no batch reference." } };
    }
    try {
      const baseUrl = resolveDionysusServiceUrl();
      const batches = await listBatches(baseUrl);
      const target = batches.find((batch) => batch.id === entry.batchId);
      if (!target) {
        return { ok: false, error: { code: "NOT_FOUND", message: "That batch no longer exists in the inventory." } };
      }
      // FIFO across the recipe's batches — the snapshotted batch may have
      // been drained by other logs since planning.
      const candidates = batches
        .filter((batch) => batch.recipeId === target.recipeId && batch.id !== null && batch.remainingPortions > 0)
        .sort((a, b) => (a.id as number) - (b.id as number));
      const totalAvailable = candidates.reduce((sum, batch) => sum + batch.remainingPortions, 0);
      if (Math.round(totalAvailable * 100) / 100 < entry.portions) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Only ${Math.round(totalAvailable * 100) / 100} portions of ${entry.batchLabel ?? "this batch"} remain.`,
          },
        };
      }
      const lines: Array<{ lineType: "batch_portion"; batchId: number; portions: number }> = [];
      let remaining = entry.portions;
      for (const batch of candidates) {
        if (remaining <= 0) break;
        const take = Math.round(Math.min(batch.remainingPortions, remaining) * 100) / 100;
        if (take <= 0) continue;
        lines.push({ lineType: "batch_portion", batchId: batch.id as number, portions: take });
        remaining = Math.round((remaining - take) * 100) / 100;
      }
      await serviceCreateMeal(baseUrl, { eatenAt: eatenAtForDate(entry.date, today), lines });
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "SERVICE_ERROR",
          message: error instanceof Error ? error.message : "dionysus-service call failed.",
        },
      };
    }
  } else {
    if (entry.ingredientId === null) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "Entry has no product reference." } };
    }
    const ingredient = await getIngredientRecordById(entry.ingredientId);
    if (!ingredient) return { ok: false, error: { code: "NOT_FOUND", message: "Product not found." } };
    const pantryRow = await getPantryItemByIngredientId(entry.ingredientId);
    if (!pantryRow) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `No pantry stock left for ${ingredient.name}.` } };
    }
    const per = defaultPortionQuantity(ingredient);
    const result = await performPantryConsumption({
      pantryItemId: pantryRow.id,
      quantity: Math.round(per.quantity * entry.portions * 100) / 100,
      unit: per.unit,
      logDate: entry.date,
      today,
    });
    if (!result.ok) return { ok: false, error: result.error };
  }

  await markPlanEntryConsumed(entry.id, new Date().toISOString());
  const updated = await getPlanEntryRecordById(entry.id);
  revalidatePath("/planner");
  revalidatePath("/pantry");
  revalidatePath("/meal-log");
  revalidatePath("/meal-log/batches");
  return { ok: true, data: updated ?? { ...entry, consumedAt: new Date().toISOString() } };
}

export async function removePlanEntry(id: number): Promise<ActionResult<null>> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Bad plan entry id." } };
  }
  const removed = await removePlanEntryRecord(id);
  if (!removed) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Plan entry not found." } };
  }
  revalidatePath("/planner");
  return { ok: true, data: null };
}
