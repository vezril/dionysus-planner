/**
 * "What Can I Cook" data-assembly wiring for `app/what-can-i-cook/page.tsx`
 * (docs/stories/S-501-what-can-i-cook.md, architecture.md §6 Flow C).
 * Mirrors `data/recipes.ts`'s per-call `createDb()` pattern — a fresh
 * connection on every call, closed before returning, never a module-scope
 * singleton.
 *
 * Runs Flow C's exact two-query fetch — `pantryRepo.getAllAsIndex` +
 * `recipeRepo.getAllWithLines`, no others — and folds the results straight
 * into `domain/matching.computeCookableAndNearMatch`, returning its result
 * verbatim. `threshold` is a required, explicit parameter: this function
 * does not resolve the env-based default itself (that's
 * `app/lib/threshold.ts#resolveDefaultThreshold`'s job, called by the
 * page) — the domain/data layers never read `process.env` (architecture
 * §4 OQ-1).
 */
import { createDb } from "@/data/db";
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import { mergeRowsByGroup, normalizeLineToRoot } from "@/domain/interchange";
import * as pantryRepo from "@/data/repositories/pantryRepo";
import * as recipeRepo from "@/data/repositories/recipeRepo";
import { computeCookableAndNearMatch } from "@/domain/matching";
import type { MatchResult } from "@/domain/matching";

export type { MatchResult };

export async function getWhatCanICook(threshold: number): Promise<MatchResult> {
  const db = createDb();
  try {
    const recipes = await recipeRepo.getAllWithLines(db);
    const { pantryIndex, normalizedRecipes } = await getGroupedMatchInputs(db, recipes);
    return computeCookableAndNearMatch(pantryIndex, normalizedRecipes, threshold);
  } finally {
    db.$client.close();
  }
}

/**
 * openspec: generic-products — group-aware inputs for the matching
 * engine: pantry rows merged per group root and recipe lines normalized
 * to the root, so interchangeable stock aggregates.
 */
export async function getGroupedMatchInputs(db: Parameters<typeof pantryRepo.getAll>[0], recipes: Awaited<ReturnType<typeof recipeRepo.getAllWithLines>>) {
  const links = await ingredientRepo.getGenericLinks(db);
  const rows = await pantryRepo.getAll(db);
  const merged = mergeRowsByGroup(rows, links);
  const pantryIndex = new Map(merged.map((row) => [row.ingredientId, { qtyCanonical: row.quantityCanonical, class: row.entryUnitClass }]));
  const normalizedRecipes = recipes.map((recipe) => ({
    ...recipe,
    lines: recipe.lines.map((line) => normalizeLineToRoot(line, links)),
  }));
  return { links, mergedRows: merged, pantryIndex, normalizedRecipes };
}

