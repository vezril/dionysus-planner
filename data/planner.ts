/**
 * Weekly-planner facade (openspec: weekly-planner) — assembles the week
 * view in one call: entries, pantry-depletion-aware suggestions, and the
 * recipe options for the add form. Per-call `createDb()` like every
 * other facade; only `/data/**` touches drizzle.
 */
import { createDb } from "@/data/db";
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

export type { PlanEntryRecord, PlanEntryRow } from "@/data/repositories/plannerRepo";

export interface PlannerWeek {
  weekStart: string;
  dates: string[];
  entriesByDate: Record<string, plannerRepo.PlanEntryRow[]>;
  suggestions: Suggestion[];
  recipeOptions: Array<{ id: number; name: string; servings: number }>;
}

export async function getPlannerWeek(weekStart: string, threshold: number): Promise<PlannerWeek> {
  const db = createDb();
  try {
    const dates = weekDates(weekStart);
    const [entries, pantryRows, pantryList, allRecipes] = await Promise.all([
      plannerRepo.listForDates(db, dates),
      pantryRepo.getAll(db),
      pantryRepo.getAllWithIngredientNames(db),
      recipeRepo.getAllWithLines(db),
    ]);

    // Planned consumption needs full ingredient records — one fetch per
    // DISTINCT planned recipe (a handful per week).
    const planned: PlannedConsumption[] = [];
    const recipeCache = new Map<number, Awaited<ReturnType<typeof recipeRepo.getWithLinesAndIngredients>>>();
    for (const entry of entries) {
      if (!recipeCache.has(entry.recipeId)) {
        recipeCache.set(entry.recipeId, await recipeRepo.getWithLinesAndIngredients(db, entry.recipeId));
      }
      const full = recipeCache.get(entry.recipeId);
      if (!full) continue;
      planned.push({
        servings: full.servings,
        portions: entry.portions,
        lines: full.lines.map((line) => ({
          id: line.id,
          quantityCanonical: line.quantityCanonical,
          entryUnitClass: line.entryUnitClass,
          displayQuantity: line.displayQuantity,
          displayUnit: line.displayUnit,
          ingredient: line.ingredient,
        })),
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

    const entriesByDate: Record<string, plannerRepo.PlanEntryRow[]> = Object.fromEntries(dates.map((date) => [date, []]));
    for (const entry of entries) {
      entriesByDate[entry.date]?.push(entry);
    }

    return {
      weekStart,
      dates,
      entriesByDate,
      suggestions,
      recipeOptions: allRecipes.map((recipe) => ({ id: recipe.id, name: recipe.name, servings: recipe.servings })),
    };
  } finally {
    db.$client.close();
  }
}

export async function addPlanEntryRecord(input: { date: string; recipeId: number; portions: number }) {
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
