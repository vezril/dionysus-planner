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
import * as pantryRepo from "@/data/repositories/pantryRepo";
import * as recipeRepo from "@/data/repositories/recipeRepo";
import { computeCookableAndNearMatch } from "@/domain/matching";
import type { MatchResult } from "@/domain/matching";

export type { MatchResult };

export async function getWhatCanICook(threshold: number): Promise<MatchResult> {
  const db = createDb();
  try {
    const pantryIndex = await pantryRepo.getAllAsIndex(db);
    const recipes = await recipeRepo.getAllWithLines(db);
    return computeCookableAndNearMatch(pantryIndex, recipes, threshold);
  } finally {
    db.$client.close();
  }
}
