/**
 * Recipe data-layer entry points for `app/actions/recipe-actions.ts` and
 * `app/recipes/page.tsx` (docs/stories/S-401-recipe-create.md). Mirrors
 * `data/ingredients.ts`'s per-call `createDb()` pattern (architecture.md
 * §5 boundary rule — only `/data/**` may import drizzle-orm/better-sqlite3):
 * a fresh connection on every call, closed before returning, never a
 * module-scope singleton.
 */
import { createDb } from "@/data/db";
import * as recipeRepo from "@/data/repositories/recipeRepo";
import type { RecipeLineInput, RecipeRecord, RecipeLineRecord } from "@/data/repositories/recipeRepo";

export interface RecipeSummary {
  id: number;
  name: string;
}

export interface RecipeWriteInputPayload {
  name: string;
  servings: number;
  instructions: string;
  lines: RecipeLineInput[];
}

/**
 * Delegates straight to `recipeRepo.createWithLines` (one transaction,
 * recipe + all lines together or neither, S-202) — this function performs
 * no validation itself; the calling Server Action owns the Zod re-parse
 * (ADR-005) and the `toCanonical` conversion before calling this.
 */
export async function createRecipeWithLines(
  input: RecipeWriteInputPayload,
): Promise<RecipeRecord & { lines: RecipeLineRecord[] }> {
  const db = createDb();
  try {
    return await recipeRepo.createWithLines(db, input);
  } finally {
    db.$client.close();
  }
}

/**
 * Lean summary list for `app/recipes/page.tsx` (S-401 AC1 — the list's
 * first real, non-placeholder content). Reuses `recipeRepo.getAllWithLines`
 * (the same single-query join Flow C/D rely on) rather than adding a
 * parallel query path; the fuller search/sort/filter feature set is
 * S-404/S-406's job, not this one's.
 */
export async function listRecipeSummaries(): Promise<RecipeSummary[]> {
  const db = createDb();
  try {
    const recipes = await recipeRepo.getAllWithLines(db);
    return recipes.map((recipe) => ({ id: recipe.id, name: recipe.name }));
  } finally {
    db.$client.close();
  }
}
