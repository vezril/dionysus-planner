"use server";

/**
 * openspec: cook-recipe-into-meals — cook a recipe at N portions into a
 * service Batch, consuming pantry stock (design D1–D4). Order: service
 * writes FIRST (ensure ingredient mirrors → ensure recipe mirror → create
 * batch), pantry decrement transaction SECOND — a service failure
 * consumes nothing. The client's per-line choices are requests, not
 * truth: every status is re-derived here.
 */
import { revalidatePath } from "next/cache";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { consumeFromPantry, getAllPantryRows, getIngredientRecordById, getPantryList } from "@/data/pantry";
import { getIngredientMicronutrients } from "@/data/ingredients";
import { getRecipeDetail } from "@/data/recipes";
import {
  canonicalUnitForClass,
  mirrorNutritionPerCanonicalUnit,
  planCookConsumption,
  type CookLinePlan,
} from "@/domain/cooking";
import { resolveQuantityForComparison, toCanonical } from "@/domain/units";
import { cookRecipeSchema } from "@/domain/validation/cook.schema";
import {
  DionysusServiceError,
  createBatch as serviceCreateBatch,
  createIngredient as serviceCreateIngredient,
  createRecipe as serviceCreateRecipe,
  listIngredients as serviceListIngredients,
  listRecipes as serviceListRecipes,
} from "@/services/dionysusService";

export interface ActionError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export interface CookPreviewLine extends CookLinePlan {
  displayQuantity: number;
  displayUnit: string;
  scaledDisplayQuantity: number;
}

export interface CookPreview {
  recipeId: number;
  recipeName: string;
  servings: number;
  portions: number;
  lines: CookPreviewLine[];
  /** Substitute picker options — every pantry row with its name/unit. */
  pantryOptions: Array<{ pantryItemId: number; ingredientId: number; name: string; displayQuantity: number; displayUnit: string }>;
}

export interface CookResult {
  batchId: number | null;
  portions: number;
  consumed: Array<{ name: string; pantryItemId: number; consumed: number; shortfall: number }>;
  ignored: string[];
  substituted: Array<{ name: string; substituteName: string }>;
}

function serviceError(error: unknown): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "SERVICE_ERROR",
      message:
        error instanceof DionysusServiceError || error instanceof Error
          ? error.message
          : "dionysus-service call failed.",
    },
  };
}

async function loadPlans(recipeId: number, portions: number) {
  const detail = await getRecipeDetail(recipeId);
  if (!detail) return null;

  const pantryRows = await getAllPantryRows();
  const rowsByIngredientId = new Map(pantryRows.map((row) => [row.ingredientId, row]));
  const factor = portions / detail.recipe.servings;
  const plans = planCookConsumption(
    detail.lines.map((line) => ({
      id: line.id,
      quantityCanonical: line.quantityCanonical,
      entryUnitClass: line.entryUnitClass,
      displayQuantity: line.displayQuantity,
      displayUnit: line.displayUnit,
      ingredient: line.ingredient,
    })),
    rowsByIngredientId,
    factor,
  );
  return { detail, pantryRows, plans, factor };
}

export async function previewCook(recipeId: number, portions: number): Promise<ActionResult<CookPreview>> {
  if (!Number.isInteger(recipeId) || recipeId <= 0 || !(portions > 0)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Bad recipe id or portion count." } };
  }
  const loaded = await loadPlans(recipeId, portions);
  if (!loaded) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Recipe not found." } };
  }
  const { detail, pantryRows, plans, factor } = loaded;

  const linesById = new Map(detail.lines.map((line) => [line.id, line]));
  return {
    ok: true,
    data: {
      recipeId,
      recipeName: detail.recipe.name,
      servings: detail.recipe.servings,
      portions,
      lines: plans.map((plan) => {
        const line = linesById.get(plan.lineId)!;
        return {
          ...plan,
          displayQuantity: line.displayQuantity,
          displayUnit: line.displayUnit,
          scaledDisplayQuantity: Math.round(line.displayQuantity * factor * 100) / 100,
        };
      }),
      pantryOptions: (await getPantryList()).map((row) => ({
        pantryItemId: row.id,
        ingredientId: row.ingredientId,
        name: row.ingredientName,
        displayQuantity: row.displayQuantity,
        displayUnit: row.displayUnit,
      })),
    },
  };
}

export async function cookRecipe(input: unknown): Promise<ActionResult<CookResult>> {
  const parsed = cookRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Cook input failed validation.",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    };
  }
  const { recipeId, portions, lines: choices } = parsed.data;

  const loaded = await loadPlans(recipeId, portions);
  if (!loaded) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Recipe not found." } };
  }
  const { detail, plans, pantryRows } = loaded;
  const pantryRowById = new Map(pantryRows.map((row) => [row.id, row]));
  const choiceByLineId = new Map(choices.map((choice) => [choice.lineId, choice]));

  // Re-derive: consumable statuses default to consume; missing/unresolved
  // REQUIRE an explicit ignore/substitute; consume on those is rejected.
  const decrements: Array<{ pantryItemId: number; amountInRowBasis: number; name: string }> = [];
  const ignored: string[] = [];
  const substituted: Array<{ name: string; substituteName: string }> = [];

  for (const plan of plans) {
    const choice = choiceByLineId.get(plan.lineId);
    const action = choice?.action ?? "consume";

    if (action === "ignore") {
      ignored.push(plan.ingredientName);
      continue;
    }

    if (action === "substitute") {
      if (choice?.action !== "substitute") continue; // type narrowing; unreachable
      const substituteRow = pantryRowById.get(choice.substitutePantryItemId);
      if (!substituteRow) {
        return { ok: false, error: { code: "VALIDATION_ERROR", message: "Substitute pantry item not found." } };
      }
      const substituteIngredient = await getIngredientRecordById(substituteRow.ingredientId);
      const entered = toCanonical(choice.substituteQuantity, choice.substituteUnit);
      const amount = resolveQuantityForComparison(
        entered.quantityCanonical,
        entered.entryUnitClass,
        substituteRow.entryUnitClass,
        substituteIngredient?.densityGPerMl ?? null,
        substituteIngredient?.packageQuantity ?? null,
        substituteIngredient?.packageUnit ?? null,
      );
      if (amount === "UNRESOLVED") {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "The substitute quantity's unit cannot be converted to that pantry item's unit.",
          },
        };
      }
      decrements.push({
        pantryItemId: substituteRow.id,
        amountInRowBasis: amount,
        name: substituteIngredient?.name ?? `pantry item ${substituteRow.id}`,
      });
      substituted.push({ name: plan.ingredientName, substituteName: substituteIngredient?.name ?? "?" });
      continue;
    }

    // action === "consume"
    if (plan.status === "missing" || plan.status === "unresolved") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `"${plan.ingredientName}" is ${plan.status} — choose Ignore or Substitute for it.`,
        },
      };
    }
    decrements.push({
      pantryItemId: plan.pantryItemId!,
      amountInRowBasis: plan.requiredInPantryBasis!,
      name: plan.ingredientName,
    });
  }

  // ---- Service writes first (design D4) ----
  let batchId: number | null = null;
  try {
    const baseUrl = resolveDionysusServiceUrl();
    const linesById = new Map(detail.lines.map((line) => [line.id, line]));

    const mirrorable = plans.filter((plan) => plan.mirrorQuantityCanonical !== null);
    if (mirrorable.length === 0) {
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "No line of this recipe can be mirrored to the meal service." },
      };
    }

    const serviceIngredients = await serviceListIngredients(baseUrl);
    const serviceIngredientIdByName = new Map(
      serviceIngredients.filter((item) => item.id !== null).map((item) => [item.name, item.id as number]),
    );
    for (const plan of mirrorable) {
      const ingredient = linesById.get(plan.lineId)!.ingredient;
      if (!serviceIngredientIdByName.has(ingredient.name)) {
        // openspec: meal-micronutrients — only a NEW mirror pays the fetch.
        const micronutrients = await getIngredientMicronutrients(ingredient.id);
        const created = await serviceCreateIngredient(baseUrl, {
          name: ingredient.name,
          ...mirrorNutritionPerCanonicalUnit(ingredient, micronutrients),
          abvPercent: null,
          directlyLoggable: false,
        });
        serviceIngredientIdByName.set(ingredient.name, created.id as number);
      }
    }

    const serviceRecipes = await serviceListRecipes(baseUrl);
    let mirrorRecipeId = serviceRecipes.find((recipe) => recipe.name === detail.recipe.name)?.id ?? null;
    if (mirrorRecipeId === null) {
      const created = await serviceCreateRecipe(baseUrl, {
        name: detail.recipe.name,
        servings: detail.recipe.servings,
        lines: mirrorable.map((plan) => {
          const ingredient = linesById.get(plan.lineId)!.ingredient;
          return {
            ingredientId: serviceIngredientIdByName.get(ingredient.name)!,
            quantity: plan.mirrorQuantityCanonical!,
            unit: canonicalUnitForClass(ingredient.unitClass),
          };
        }),
      });
      mirrorRecipeId = created.id;
    }

    const batch = await serviceCreateBatch(baseUrl, {
      recipeId: mirrorRecipeId as number,
      cookedAt: new Date().toISOString(),
      servingsMade: portions,
    });
    batchId = batch.id;
  } catch (error) {
    return serviceError(error);
  }

  // ---- Pantry consumption second (one transaction) ----
  const applied = await consumeFromPantry(
    decrements.map(({ pantryItemId, amountInRowBasis }) => ({ pantryItemId, amountInRowBasis })),
  );

  revalidatePath("/pantry");
  revalidatePath("/meal-log/batches");

  return {
    ok: true,
    data: {
      batchId,
      portions,
      consumed: applied.map((entry, index) => ({
        name: decrements[index].name,
        pantryItemId: entry.pantryItemId,
        consumed: entry.consumed,
        shortfall: entry.shortfall,
      })),
      ignored,
      substituted,
    },
  };
}
