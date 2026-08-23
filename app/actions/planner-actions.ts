"use server";

/**
 * openspec: weekly-planner — plan-entry Server Actions, following the
 * ActionResult convention. Plans are planner-local; no service calls.
 */
import { revalidatePath } from "next/cache";
import { getIngredientRecordById } from "@/data/ingredients";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { addPlanEntryRecord, removePlanEntryRecord, type PlanEntryRecord } from "@/data/planner";
import { getRecipeDetail } from "@/data/recipes";
import { planEntrySchema } from "@/domain/validation/planEntry.schema";
import { listBatches, listRecipes } from "@/services/dionysusService";

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
