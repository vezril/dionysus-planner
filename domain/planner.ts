/**
 * Weekly planner math (openspec: weekly-planner). Pure, framework-free.
 *
 * The suggestion engine is deliberately COMPOSED from existing pieces:
 * plan depletion reuses `planCookConsumption` (the cook flow's own
 * consumption planner, package/density bridges included), and ranking
 * reuses `computeCookableAndNearMatch` against the depleted pantry index.
 */
import { planCookConsumption, type CookLine, type CookPantryRow } from "@/domain/cooking";
import { computeFreshness } from "@/domain/freshness";
import {
  computeCookableAndNearMatch,
  type PantryIndex,
  type RecipeWithLines,
} from "@/domain/matching";
import type { UnitClass } from "@/domain/types";

const MS_PER_DAY = 86_400_000;

/** Monday of the week containing `dateIso` (YYYY-MM-DD, calendar math —
 * timezone resolution happens at the caller). */
export function weekStartOf(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const day = date.getUTCDay(); // 0 = Sunday
  const back = (day + 6) % 7;
  return new Date(date.getTime() - back * MS_PER_DAY).toISOString().slice(0, 10);
}

export function weekDates(weekStartIso: string): string[] {
  const start = new Date(`${weekStartIso}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(start.getTime() + index * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

export function shiftWeek(weekStartIso: string, deltaWeeks: number): string {
  const start = new Date(`${weekStartIso}T00:00:00Z`);
  return new Date(start.getTime() + deltaWeeks * 7 * MS_PER_DAY).toISOString().slice(0, 10);
}

export interface PlannedConsumption {
  /** Recipe lines in the cook planner's shape. */
  lines: CookLine[];
  servings: number;
  portions: number;
}

export interface DepletableRow extends CookPantryRow {
  entryUnitClass: UnitClass;
}

/**
 * Simulates the week's planned consumption against the pantry: each
 * entry's lines are resolved into their pantry rows' own bases (exactly
 * as the cook flow would) and deducted, flooring at zero. Unresolvable
 * or missing lines deduct nothing. Returns NEW rows; input untouched.
 */
export function depletePantryByPlan(
  pantryRows: DepletableRow[],
  planned: PlannedConsumption[],
): DepletableRow[] {
  const rows = pantryRows.map((row) => ({ ...row }));
  const byIngredientId = new Map(rows.map((row) => [row.ingredientId, row]));

  for (const entry of planned) {
    const factor = entry.portions / entry.servings;
    const plans = planCookConsumption(entry.lines, byIngredientId, factor);
    for (const plan of plans) {
      if (plan.requiredInPantryBasis === null || plan.pantryItemId === null) continue;
      const row = byIngredientId.get(plan.ingredientId);
      if (!row) continue;
      row.quantityCanonical = Math.max(0, row.quantityCanonical - plan.requiredInPantryBasis);
    }
  }
  return rows;
}

export function toPantryIndex(rows: DepletableRow[]): PantryIndex {
  return new Map(rows.map((row) => [row.ingredientId, { qtyCanonical: row.quantityCanonical, class: row.entryUnitClass }]));
}

export interface SuggestionInput {
  recipes: RecipeWithLines[];
  depletedRows: DepletableRow[];
  /** ingredientId → {stockedAt, shelfLifeDays} for expiring detection. */
  freshnessByIngredientId: Map<number, { stockedAt: string | null; shelfLifeDays: number | null }>;
  threshold: number;
  now: Date;
}

export interface Suggestion {
  recipeId: number;
  name: string;
  tier: "cookable" | "near";
  usesExpiring: boolean;
  missingCount: number;
}

/**
 * Cookable first, then near-matches (the matcher's own order within the
 * tier); recipes using expiring/expired pantry stock float to the top of
 * their tier — a stable boost, never a tier change.
 */
export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const { recipes, depletedRows, freshnessByIngredientId, threshold, now } = input;

  const expiringIngredientIds = new Set<number>();
  for (const row of depletedRows) {
    if (row.quantityCanonical <= 0) continue;
    const info = freshnessByIngredientId.get(row.ingredientId);
    if (!info) continue;
    const freshness = computeFreshness(info.stockedAt, info.shelfLifeDays, now);
    if (freshness && freshness.status !== "fresh") expiringIngredientIds.add(row.ingredientId);
  }

  const result = computeCookableAndNearMatch(toPantryIndex(depletedRows), recipes, threshold);

  const usesExpiring = (recipe: RecipeWithLines): boolean =>
    recipe.lines.some((line) => expiringIngredientIds.has(line.ingredientId));

  const stableBoost = <T extends { usesExpiring: boolean }>(items: T[]): T[] => [
    ...items.filter((item) => item.usesExpiring),
    ...items.filter((item) => !item.usesExpiring),
  ];

  const cookable = stableBoost(
    result.cookable.map((recipe) => ({
      recipeId: recipe.id,
      name: recipe.name,
      tier: "cookable" as const,
      usesExpiring: usesExpiring(recipe),
      missingCount: 0,
    })),
  );
  const near = stableBoost(
    result.nearMatch.map((recipe) => ({
      recipeId: recipe.id,
      name: recipe.name,
      tier: "near" as const,
      usesExpiring: usesExpiring(recipe),
      missingCount: recipe.unsatisfiedLines.length,
    })),
  );
  return [...cookable, ...near];
}
