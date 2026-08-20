"use server";

/**
 * openspec: weekly-planner — plan-entry Server Actions, following the
 * ActionResult convention. Plans are planner-local; no service calls.
 */
import { revalidatePath } from "next/cache";
import { addPlanEntryRecord, removePlanEntryRecord, type PlanEntryRecord } from "@/data/planner";
import { getRecipeDetail } from "@/data/recipes";
import { planEntrySchema } from "@/domain/validation/planEntry.schema";

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

  const recipe = await getRecipeDetail(parsed.data.recipeId);
  if (!recipe) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Recipe not found." } };
  }

  const record = await addPlanEntryRecord(parsed.data);
  revalidatePath("/planner");
  return { ok: true, data: record };
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
