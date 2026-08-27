/**
 * Weekly-planner facade (openspec: weekly-planner) — assembles the week
 * view in one call: entries, pantry-depletion-aware suggestions, and the
 * recipe options for the add form. Per-call `createDb()` like every
 * other facade; only `/data/**` touches drizzle.
 */
import { createDb } from "@/data/db";
import { getPantryList } from "@/data/pantry";
import * as pantryRepo from "@/data/repositories/pantryRepo";
import * as plannerRepo from "@/data/repositories/plannerRepo";
import * as recipeRepo from "@/data/repositories/recipeRepo";
import {
  buildSuggestions,
  depletePantryByPlan,
  weekDates,
  type PlannedConsumption,
  type Suggestion,
} from "@/domain/planner";
import { buildShoppingList, type ShoppingList } from "@/domain/shoppingList";
import { computeRecipeNutrition } from "@/domain/nutrition";
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import { mergeRowsByGroup, normalizeLineToRoot } from "@/domain/interchange";
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { listBatches, listRecipes as listServiceRecipes } from "@/services/dionysusService";

export type { PlanEntryRecord } from "@/data/repositories/plannerRepo";

/** openspec: planner-day-click-and-calories — repo row + display calories
 * (total for the entry's portions; null when uncomputable). */
export interface PlanEntryRow extends plannerRepo.PlanEntryRow {
  caloriesKcal: number | null;
}

export interface PlannerWeek {
  weekStart: string;
  dates: string[];
  entriesByDate: Record<string, PlanEntryRow[]>;
  suggestions: Suggestion[];
  shoppingList: ShoppingList;
  /** openspec: planner-ready-to-eat — service batches minus reservations.
   * openspec: planner-consume — plannedPortions = unconsumed plan entries
   * (any date) still reserving this recipe's batches. */
  readyToEat: Array<{ batchId: number; label: string; availablePortions: number; plannedPortions: number }>;
  /** openspec: plan-pantry-backdate — ready-to-eat stocked pantry
   * products, plannable straight onto a day. */
  pantryOptions: Array<{ ingredientId: number; name: string }>;
  serviceAvailable: boolean;
  recipeOptions: Array<{ id: number; name: string; servings: number }>;
}

export async function getPlannerWeek(weekStart: string, threshold: number): Promise<PlannerWeek> {
  const db = createDb();
  try {
    const dates = weekDates(weekStart);
    const [entries, rawPantryRows, pantryList, rawRecipes, genericLinks] = await Promise.all([
      plannerRepo.listForDates(db, dates),
      pantryRepo.getAll(db),
      pantryRepo.getAllWithIngredientNames(db),
      recipeRepo.getAllWithLines(db),
      ingredientRepo.getGenericLinks(db),
    ]);
    // openspec: generic-products — one virtual pool per group.
    const pantryRows = mergeRowsByGroup(rawPantryRows, genericLinks);
    const allRecipes = rawRecipes.map((recipe) => ({
      ...recipe,
      lines: recipe.lines.map((line) => normalizeLineToRoot(line, genericLinks)),
    }));

    // Planned consumption needs full ingredient records — one fetch per
    // DISTINCT planned recipe (a handful per week).
    const planned: PlannedConsumption[] = [];
    const recipeCache = new Map<number, Awaited<ReturnType<typeof recipeRepo.getWithLinesAndIngredients>>>();
    for (const entry of entries) {
      if (entry.kind !== "cook" || entry.recipeId === null) continue; // batch entries consume no pantry
      if (!recipeCache.has(entry.recipeId)) {
        recipeCache.set(entry.recipeId, await recipeRepo.getWithLinesAndIngredients(db, entry.recipeId));
      }
      const full = recipeCache.get(entry.recipeId);
      if (!full) continue;
      planned.push({
        servings: full.servings,
        portions: entry.portions,
        lines: full.lines.map((line) =>
          normalizeLineToRoot(
            {
              id: line.id,
              ingredientId: line.ingredientId,
              quantityCanonical: line.quantityCanonical,
              entryUnitClass: line.entryUnitClass,
              displayQuantity: line.displayQuantity,
              displayUnit: line.displayUnit,
              ingredient: line.ingredient,
            },
            genericLinks,
          ),
        ),
      });
    }
    const depleted = depletePantryByPlan(
      pantryRows.map((row) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        quantityCanonical: row.quantityCanonical,
        entryUnitClass: row.entryUnitClass,
      })),
      planned,
    );

    const freshnessByIngredientId = new Map(
      pantryList.map((row) => [row.ingredientId, { stockedAt: row.stockedAt, shelfLifeDays: row.shelfLifeDays }]),
    );

    const suggestions = buildSuggestions({
      recipes: allRecipes,
      depletedRows: depleted,
      freshnessByIngredientId,
      threshold,
      now: new Date(),
    });


    // openspec: shopping-list — same planned array, collected instead of
    // discarded (buildShoppingList copies rows; order matches entry order).
    const shoppingList = buildShoppingList(
      pantryRows.map((row) => ({
        id: row.id,
        ingredientId: row.ingredientId,
        quantityCanonical: row.quantityCanonical,
        entryUnitClass: row.entryUnitClass,
      })),
      planned,
    );

    // Ready to eat: service batches minus every still-unconsumed planned
    // batch portion, whatever week it sits on (openspec: planner-consume).
    let readyToEat: Array<{ batchId: number; label: string; availablePortions: number; plannedPortions: number }> = [];
    let serviceAvailable = true;
    const batchCaloriesPerServing = new Map<number, number>();
    try {
      const baseUrl = resolveDionysusServiceUrl();
      const [batches, serviceRecipes] = await Promise.all([listBatches(baseUrl), listServiceRecipes(baseUrl)]);
      const nameByRecipeId = new Map(serviceRecipes.map((recipe) => [recipe.id, recipe.name]));
      const perServingByRecipeId = new Map(
        serviceRecipes.map((recipe) => [recipe.id, recipe.perServingNutrition?.caloriesKcal ?? null]),
      );
      for (const batch of batches) {
        if (batch.id === null) continue;
        const perServing = perServingByRecipeId.get(batch.recipeId);
        if (perServing !== undefined && perServing !== null) batchCaloriesPerServing.set(batch.id, perServing);
      }
      const plannedByBatch = new Map<number, number>();
      for (const plan of await plannerRepo.listUnconsumedBatchPlans(db)) {
        plannedByBatch.set(plan.batchId, (plannedByBatch.get(plan.batchId) ?? 0) + plan.portions);
      }
      // openspec: pantry-quick-eat — one row per recipe, portions summed
      // across batches; the row carries the OLDEST batch with portions
      // left so logging drains batches first-in-first-out.
      const groupedByRecipe = new Map<
        number,
        { batchId: number | null; label: string; availablePortions: number; plannedPortions: number }
      >();
      for (const batch of [...batches].sort((a, b) => (a.id as number) - (b.id as number))) {
        if (batch.id === null) continue;
        const planned = plannedByBatch.get(batch.id) ?? 0;
        const available = Math.round((batch.remainingPortions - planned) * 100) / 100;
        let group = groupedByRecipe.get(batch.recipeId);
        if (!group) {
          group = {
            batchId: null,
            label: nameByRecipeId.get(batch.recipeId) ?? `Batch #${batch.id}`,
            availablePortions: 0,
            plannedPortions: 0,
          };
          groupedByRecipe.set(batch.recipeId, group);
        }
        group.plannedPortions = Math.round((group.plannedPortions + planned) * 100) / 100;
        if (available > 0) {
          group.availablePortions = Math.round((group.availablePortions + available) * 100) / 100;
          if (group.batchId === null) group.batchId = batch.id;
        }
      }
      readyToEat = [...groupedByRecipe.values()]
        .filter((group): group is typeof group & { batchId: number } => group.batchId !== null)
        .map(({ batchId, label, availablePortions, plannedPortions }) => ({
          batchId,
          label,
          availablePortions,
          plannedPortions,
        }));
    } catch {
      serviceAvailable = false;
    }

    // openspec: planner-day-click-and-calories — per-entry calorie totals.
    const cookCaloriesPerServing = new Map<number, number | null>();
    for (const [cookRecipeId, full] of recipeCache) {
      if (!full) {
        cookCaloriesPerServing.set(cookRecipeId, null);
        continue;
      }
      const nutrition = computeRecipeNutrition(
        {
          id: full.id,
          servings: full.servings,
          lines: full.lines.map((line) => ({
            id: line.id,
            ingredientId: line.ingredientId,
            quantityCanonical: line.quantityCanonical,
            entryUnitClass: line.entryUnitClass,
          })),
        },
        Object.fromEntries(full.lines.map((line) => [line.ingredient.id, line.ingredient])),
      );
      cookCaloriesPerServing.set(cookRecipeId, nutrition.perServing.calories.value);
    }

    const entriesByDate: Record<string, PlanEntryRow[]> = Object.fromEntries(dates.map((date) => [date, []]));
    for (const entry of entries) {
      let caloriesKcal: number | null = null;
      if (entry.kind === "cook" && entry.recipeId !== null) {
        const perServing = cookCaloriesPerServing.get(entry.recipeId) ?? null;
        if (perServing !== null) caloriesKcal = Math.round(perServing * entry.portions);
      } else if (entry.kind === "eat_batch" && entry.batchId !== null) {
        const perServing = batchCaloriesPerServing.get(entry.batchId) ?? null;
        if (perServing !== null) caloriesKcal = Math.round(perServing * entry.portions);
      }
      entriesByDate[entry.date]?.push({ ...entry, caloriesKcal });
    }

    // openspec: plan-pantry-backdate — dedupe stocked ready-to-eat
    // products for the picker.
    const pantryOptionsById = new Map<number, string>();
    for (const row of await getPantryList()) {
      if (row.readyToEat && row.displayQuantity > 0) pantryOptionsById.set(row.ingredientId, row.ingredientName);
    }

    return {
      weekStart,
      dates,
      entriesByDate,
      suggestions,
      shoppingList,
      readyToEat,
      pantryOptions: [...pantryOptionsById].map(([ingredientId, name]) => ({ ingredientId, name })),
      serviceAvailable,
      recipeOptions: allRecipes.map((recipe) => ({ id: recipe.id, name: recipe.name, servings: recipe.servings })),
    };
  } finally {
    db.$client.close();
  }
}

export async function addPlanEntryRecord(input: plannerRepo.PlanEntryInsert) {
  const db = createDb();
  try {
    return await plannerRepo.add(db, input);
  } finally {
    db.$client.close();
  }
}

export async function removePlanEntryRecord(id: number): Promise<boolean> {
  const db = createDb();
  try {
    return await plannerRepo.remove(db, id);
  } finally {
    db.$client.close();
  }
}

/** openspec: planner-consume — single-entry read for the consume action. */
export async function getPlanEntryRecordById(id: number): Promise<plannerRepo.PlanEntryRecord | null> {
  const db = createDb();
  try {
    return await plannerRepo.getById(db, id);
  } finally {
    db.$client.close();
  }
}

/** openspec: planner-consume — flip an intention to eaten. */
export async function markPlanEntryConsumed(id: number, consumedAt: string): Promise<boolean> {
  const db = createDb();
  try {
    return await plannerRepo.markConsumed(db, id, consumedAt);
  } finally {
    db.$client.close();
  }
}

/** openspec: planner-consume — unconsumed planned portions per batch id
 * (any date), for the Batches page and availability math. */
export async function getPlannedPortionsByBatch(): Promise<Map<number, number>> {
  const db = createDb();
  try {
    const plans = await plannerRepo.listUnconsumedBatchPlans(db);
    const byBatch = new Map<number, number>();
    for (const plan of plans) {
      byBatch.set(plan.batchId, Math.round(((byBatch.get(plan.batchId) ?? 0) + plan.portions) * 100) / 100);
    }
    return byBatch;
  } finally {
    db.$client.close();
  }
}
