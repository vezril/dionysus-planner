"use server";

/**
 * openspec: meal-log-integration — Meal Log Server Actions, following the
 * same `ActionError { code, message, fieldErrors? }` / `{ ok, data | error }`
 * contract every other action file in this app uses (ADR-005 shared Zod
 * re-validation).
 *
 * Calls only `services/dionysusService.ts` — never drizzle/better-sqlite3.
 * `SERVICE_ERROR` is the HTTP-dependency analog of the DB-backed actions'
 * `PERSISTENCE_ERROR`: a network failure or non-2xx response from
 * dionysus-service, always caught and mapped, never an unhandled exception.
 */
import { revalidatePath } from "next/cache";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { addPlanEntryRecord } from "@/data/planner";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import {
  mealLogBatchSchema,
  mealLogIngredientSchema,
  mealLogMealSchema,
  mealLogRecipeSchema,
} from "@/domain/validation/mealLog.schema";
import {
  DionysusServiceError,
  createBatch as serviceCreateBatch,
  createIngredient as serviceCreateIngredient,
  createMeal as serviceCreateMeal,
  createRecipe as serviceCreateRecipe,
  listBatches,
  listRecipes,
  type BatchJson,
  type IngredientJson,
  type MealJson,
  type RecipeJson,
} from "@/services/dionysusService";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

function validationError(message: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error: { code: "VALIDATION_ERROR", message, fieldErrors } };
}

function serviceError(error: unknown): ActionResult<never> {
  if (error instanceof DionysusServiceError) {
    return { ok: false, error: { code: "SERVICE_ERROR", message: error.message } };
  }
  return {
    ok: false,
    error: {
      code: "SERVICE_ERROR",
      message: error instanceof Error ? error.message : "dionysus-service call failed.",
    },
  };
}

export async function createMealLogIngredient(input: unknown): Promise<ActionResult<IngredientJson>> {
  const parsed = mealLogIngredientSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Ingredient input failed validation.", parsed.error.flatten().fieldErrors);
  }

  try {
    const baseUrl = resolveDionysusServiceUrl();
    const data = await serviceCreateIngredient(baseUrl, {
      name: parsed.data.name,
      caloriesKcal: parsed.data.caloriesKcal,
      proteinG: parsed.data.proteinG,
      carbsG: parsed.data.carbsG,
      fatG: parsed.data.fatG,
      sodiumMg: parsed.data.sodiumMg,
      abvPercent: parsed.data.abvPercent ?? null,
      directlyLoggable: parsed.data.directlyLoggable,
    });
    revalidatePath("/meal-log/ingredients");
    return { ok: true, data };
  } catch (error) {
    return serviceError(error);
  }
}

export async function createMealLogRecipe(input: unknown): Promise<ActionResult<RecipeJson>> {
  const parsed = mealLogRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Recipe input failed validation.", parsed.error.flatten().fieldErrors);
  }

  try {
    const baseUrl = resolveDionysusServiceUrl();
    const data = await serviceCreateRecipe(baseUrl, {
      name: parsed.data.name,
      servings: parsed.data.servings,
      lines: parsed.data.lines,
    });
    revalidatePath("/meal-log/recipes");
    return { ok: true, data };
  } catch (error) {
    return serviceError(error);
  }
}

export async function createMealLogBatch(input: unknown): Promise<ActionResult<BatchJson>> {
  const parsed = mealLogBatchSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Batch input failed validation.", parsed.error.flatten().fieldErrors);
  }

  try {
    const baseUrl = resolveDionysusServiceUrl();
    const data = await serviceCreateBatch(baseUrl, {
      recipeId: parsed.data.recipeId,
      cookedAt: parsed.data.cookedAt,
      servingsMade: parsed.data.servingsMade,
    });
    revalidatePath("/meal-log/batches");
    return { ok: true, data };
  } catch (error) {
    return serviceError(error);
  }
}

export async function logMeal(input: unknown): Promise<ActionResult<MealJson>> {
  const parsed = mealLogMealSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("Meal input failed validation.", parsed.error.flatten().fieldErrors);
  }

  try {
    const baseUrl = resolveDionysusServiceUrl();
    const data = await serviceCreateMeal(baseUrl, {
      eatenAt: parsed.data.eatenAt,
      lines: parsed.data.lines,
    });
    revalidatePath("/meal-log");
    return { ok: true, data };
  } catch (error) {
    return serviceError(error);
  }
}

/**
 * openspec: eat-now-and-quick-log — one batch portion, eaten now (design
 * D2). The service's remaining-portions guard is authoritative under
 * races; this action just relays its error.
 */
export async function quickLogBatchPortion(batchId: number): Promise<ActionResult<MealJson>> {
  if (!Number.isInteger(batchId) || batchId <= 0) {
    return validationError("Bad batch id.");
  }
  try {
    const baseUrl = resolveDionysusServiceUrl();
    const data = await serviceCreateMeal(baseUrl, {
      eatenAt: new Date().toISOString(),
      lines: [{ lineType: "batch_portion", batchId, portions: 1 }],
    });
    // openspec: subrecipes-consume-qol — the logged portion lands on
    // today's plan so immediate consumption is always accounted.
    const [batches, recipes] = await Promise.all([listBatches(baseUrl), listRecipes(baseUrl)]);
    const batch = batches.find((candidate) => candidate.id === batchId);
    const label = batch ? (recipes.find((recipe) => recipe.id === batch.recipeId)?.name ?? `Batch #${batchId}`) : `Batch #${batchId}`;
    await addPlanEntryRecord({
      date: todayIsoDateIn(resolveDionysusTimezone()),
      kind: "eat_item",
      recipeId: null,
      batchId,
      batchLabel: label,
      portions: 1,
    });
    revalidatePath("/planner");
    revalidatePath("/meal-log");
    revalidatePath("/meal-log/batches");
    return { ok: true, data };
  } catch (error) {
    return serviceError(error);
  }
}
