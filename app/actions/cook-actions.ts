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
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { addPlanEntryRecord } from "@/data/planner";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { consumeFromPantry, getAllPantryRows, getIngredientRecordById, getPantryList } from "@/data/pantry";
import { getGenericLinksMap } from "@/data/ingredients";
import { rootOf } from "@/domain/interchange";
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
  createMeal as serviceCreateMeal,
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

export interface CookCandidate {
  pantryItemId: number;
  name: string;
  displayQuantity: number;
  displayUnit: string;
}

export interface CookPreviewLine extends Omit<CookLinePlan, "status"> {
  /** openspec: generic-products — "choice" when several interchangeable
   * pantry products could satisfy the line. */
  status: CookLinePlan["status"] | "choice";
  candidates: CookCandidate[];
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
  /** openspec: eat-now-and-quick-log — portions logged as eaten in the same confirm. */
  eatenNow: number;
  warnings: string[];
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

  const [pantryRows, pantryList, genericLinks] = await Promise.all([
    getAllPantryRows(),
    getPantryList(),
    getGenericLinksMap(),
  ]);
  const nameByPantryItemId = new Map(pantryList.map((row) => [row.id, row.ingredientName]));
  const factor = portions / detail.recipe.servings;

  // openspec: generic-products — candidates are the STOCKED rows of the
  // line ingredient's group. One candidate plans as before; several
  // demand a choice; none is missing.
  const rowsByRoot = new Map<number, typeof pantryRows>();
  for (const row of pantryRows) {
    if (row.quantityCanonical <= 0) continue;
    const root = rootOf(row.ingredientId, genericLinks);
    const bucket = rowsByRoot.get(root);
    if (bucket) bucket.push(row);
    else rowsByRoot.set(root, [row]);
  }

  const plans = detail.lines.map((line) => {
    const cookLine = {
      id: line.id,
      quantityCanonical: line.quantityCanonical,
      entryUnitClass: line.entryUnitClass,
      displayQuantity: line.displayQuantity,
      displayUnit: line.displayUnit,
      ingredient: line.ingredient,
    };
    const root = rootOf(line.ingredientId, genericLinks);
    const candidates = rowsByRoot.get(root) ?? [];

    const planAgainst = (row: (typeof pantryRows)[number] | undefined) =>
      planCookConsumption(
        [cookLine],
        row ? new Map([[line.ingredient.id, { ...row, ingredientId: line.ingredient.id }]]) : new Map(),
        factor,
      )[0];

    if (candidates.length <= 1) {
      return { plan: planAgainst(candidates[0]), candidates, line };
    }
    const base = planAgainst(undefined); // mirror math without a row
    return {
      plan: { ...base, status: "choice" as const, pantryItemId: null, requiredInPantryBasis: null, availableInPantryBasis: null },
      candidates,
      line,
    };
  });

  return { detail, pantryRows, plans, factor, genericLinks, rowsByRoot, nameByPantryItemId };
}

export async function previewCook(recipeId: number, portions: number): Promise<ActionResult<CookPreview>> {
  if (!Number.isInteger(recipeId) || recipeId <= 0 || !(portions > 0)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Bad recipe id or portion count." } };
  }
  const loaded = await loadPlans(recipeId, portions);
  if (!loaded) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Recipe not found." } };
  }
  const { detail, factor } = loaded;
  const plans = loaded.plans;
  return {
    ok: true,
    data: {
      recipeId,
      recipeName: detail.recipe.name,
      servings: detail.recipe.servings,
      portions,
      lines: plans.map(({ plan, candidates, line }) => ({
        ...plan,
        candidates: candidates.map((row) => ({
          pantryItemId: row.id,
          name: loaded.nameByPantryItemId.get(row.id) ?? `pantry item ${row.id}`,
          displayQuantity: row.displayQuantity,
          displayUnit: row.displayUnit,
        })),
        displayQuantity: line.displayQuantity,
        displayUnit: line.displayUnit,
        scaledDisplayQuantity: Math.round(line.displayQuantity * factor * 100) / 100,
      })),
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
  const { recipeId, portions, eatNowPortions, lines: choices } = parsed.data;
  if (eatNowPortions > portions) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "You can't eat more portions than you're cooking.",
        fieldErrors: { eatNowPortions: ["At most the cooked portion count."] },
      },
    };
  }

  const loaded = await loadPlans(recipeId, portions);
  if (!loaded) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Recipe not found." } };
  }
  const { detail, plans, pantryRows, factor } = loaded;
  const pantryRowById = new Map(pantryRows.map((row) => [row.id, row]));
  const choiceByLineId = new Map(choices.map((choice) => [choice.lineId, choice]));

  // Re-derive: consumable statuses default to consume; missing/unresolved
  // REQUIRE an explicit ignore/substitute; consume on those is rejected.
  const decrements: Array<{ pantryItemId: number; amountInRowBasis: number; name: string }> = [];
  const ignored: string[] = [];
  const substituted: Array<{ name: string; substituteName: string }> = [];
  // openspec: batch-nutrition-and-abv-entry — what ACTUALLY goes in the pot,
  // per line, in authored basis: drives the service recipe mirror.
  type ActualLine = {
    ingredient: NonNullable<Awaited<ReturnType<typeof getIngredientRecordById>>>;
    quantityCanonical: number;
  };
  const actualByLineId = new Map<number, ActualLine>();

  for (const { plan, candidates, line } of plans) {
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
      if (substituteIngredient) {
        const inSubstituteClass = resolveQuantityForComparison(
          entered.quantityCanonical,
          entered.entryUnitClass,
          substituteIngredient.unitClass,
          substituteIngredient.densityGPerMl,
          substituteIngredient.packageQuantity,
          substituteIngredient.packageUnit,
        );
        if (inSubstituteClass !== "UNRESOLVED") {
          // Entered quantity is for THIS cook (factor-scaled) — de-scale to
          // the mirror's authored basis.
          actualByLineId.set(plan.lineId, {
            ingredient: substituteIngredient,
            quantityCanonical: inSubstituteClass / factor,
          });
        }
      }
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

    // openspec: generic-products — a multi-candidate line must say which
    // product is used; the chosen row is re-planned server-side.
    const usePantryItemId = choice?.action === "consume" ? choice.usePantryItemId : undefined;
    if (plan.status === "choice" || usePantryItemId !== undefined) {
      const chosenId = usePantryItemId;
      if (chosenId === undefined) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Several products can cover "${plan.ingredientName}" — pick which one you're using.`,
          },
        };
      }
      const chosenRow = candidates.find((candidate) => candidate.id === chosenId);
      if (!chosenRow) {
        return {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: `That product can't cover "${plan.ingredientName}".` },
        };
      }
      const rePlanned = planCookConsumption(
        [
          {
            id: line.id,
            quantityCanonical: line.quantityCanonical,
            entryUnitClass: line.entryUnitClass,
            displayQuantity: line.displayQuantity,
            displayUnit: line.displayUnit,
            ingredient: line.ingredient,
          },
        ],
        new Map([[line.ingredient.id, { ...chosenRow, ingredientId: line.ingredient.id }]]),
        factor,
      )[0];
      if (rePlanned.requiredInPantryBasis === null) {
        return {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: `"${plan.ingredientName}" cannot resolve against that product.` },
        };
      }
      decrements.push({
        pantryItemId: chosenRow.id,
        amountInRowBasis: rePlanned.requiredInPantryBasis,
        name: plan.ingredientName,
      });
      if (plan.mirrorQuantityCanonical !== null) {
        const pickedIngredient = await getIngredientRecordById(chosenRow.ingredientId);
        if (pickedIngredient) {
          // Same class as the generic (write-time invariant) — the authored
          // canonical amount carries over; the NUTRITION is the pick's.
          actualByLineId.set(plan.lineId, {
            ingredient: pickedIngredient,
            quantityCanonical: plan.mirrorQuantityCanonical,
          });
        }
      }
      continue;
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

    const mirrorable = plans.map(({ plan }) => plan).filter((plan) => plan.mirrorQuantityCanonical !== null);
    if (mirrorable.length === 0) {
      return {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "No line of this recipe can be mirrored to the meal service." },
      };
    }

    // openspec: batch-nutrition-and-abv-entry — mirror what actually went
    // in: pick/substitute per line, authored ingredient otherwise
    // (ignored lines included — skipped stock, not stomach).
    const mirrorLines = mirrorable.map((plan) => {
      const authored = linesById.get(plan.lineId)!.ingredient;
      const actual = actualByLineId.get(plan.lineId);
      return {
        lineId: plan.lineId,
        ingredient: actual?.ingredient ?? authored,
        quantityCanonical: actual?.quantityCanonical ?? plan.mirrorQuantityCanonical!,
      };
    });

    const serviceIngredients = await serviceListIngredients(baseUrl);
    const serviceIngredientIdByName = new Map(
      serviceIngredients.filter((item) => item.id !== null).map((item) => [item.name, item.id as number]),
    );
    for (const mirrorLine of mirrorLines) {
      const ingredient = mirrorLine.ingredient;
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

    const desiredLines = mirrorLines.map((mirrorLine) => ({
      ingredientId: serviceIngredientIdByName.get(mirrorLine.ingredient.name)!,
      quantity: Math.round(mirrorLine.quantityCanonical * 10_000) / 10_000,
      unit: canonicalUnitForClass(mirrorLine.ingredient.unitClass),
    }));
    const signatureOf = (lines: Array<{ ingredientId: number; quantity: number; unit: string }>): string =>
      lines
        .map((line) => `${line.ingredientId}|${Math.round(line.quantity * 10_000) / 10_000}|${line.unit}`)
        .sort()
        .join(";");
    const desiredSignature = signatureOf(desiredLines);

    // Reuse only an EXACT variant (name + line signature) — a Kirkland cook
    // and a Lactantia cook are different service recipes with the same name.
    const serviceRecipes = await serviceListRecipes(baseUrl);
    let mirrorRecipeId =
      serviceRecipes.find(
        (recipe) =>
          recipe.name === detail.recipe.name &&
          recipe.servings === detail.recipe.servings &&
          signatureOf(recipe.lines) === desiredSignature,
      )?.id ?? null;
    if (mirrorRecipeId === null) {
      const created = await serviceCreateRecipe(baseUrl, {
        name: detail.recipe.name,
        servings: detail.recipe.servings,
        lines: desiredLines,
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

  // openspec: eat-now-and-quick-log — the meal log is the only step allowed
  // to fail softly: batch + pantry are already reality (design D1).
  const warnings: string[] = [];
  let eatenNow = 0;
  if (eatNowPortions > 0 && batchId !== null) {
    try {
      const baseUrl = resolveDionysusServiceUrl();
      await serviceCreateMeal(baseUrl, {
        eatenAt: new Date().toISOString(),
        lines: [{ lineType: "batch_portion", batchId, portions: eatNowPortions }],
      });
      eatenNow = eatNowPortions;
    } catch (error) {
      warnings.push(
        `Cooked and pantry updated, but logging the meal failed (${
          error instanceof Error ? error.message : "service error"
        }) — log it from Meals › Log.`,
      );
    }
  }

  // openspec: subrecipes-consume-qol — eaten-now portions land on
  // today's plan so immediate consumption is always accounted.
  if (eatenNow > 0) {
    await addPlanEntryRecord({
      date: todayIsoDateIn(resolveDionysusTimezone()),
      kind: "eat_item",
      recipeId: null,
      batchId,
      batchLabel: detail.recipe.name,
      portions: eatenNow,
    });
    revalidatePath("/planner");
  }

  revalidatePath("/pantry");
  revalidatePath("/meal-log");
  revalidatePath("/meal-log/batches");

  return {
    ok: true,
    data: {
      batchId,
      portions,
      eatenNow,
      warnings,
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
