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
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";
import { computeRecipeNutrition } from "@/domain/nutrition";
import type { RecipeNutrition } from "@/domain/nutrition";

export interface RecipeSummary {
  id: number;
  name: string;
}

export interface RecipeDetail {
  recipe: RecipeRecord;
  lines: Array<RecipeLineRecord & { ingredient: IngredientRecord }>;
  nutrition: RecipeNutrition;
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

/**
 * Assembles a recipe detail view for `app/recipes/[id]/page.tsx`
 * (docs/stories/S-403-recipe-detail-nutrition.md, architecture.md §6 Flow
 * B): one joined query (`recipeRepo.getWithLinesAndIngredients`) folded
 * straight into `domain/nutrition.computeRecipeNutrition`. Computed fresh
 * on every call — no caching (ADR-011).
 *
 * Returns `null` for a nonexistent recipe id, mirroring
 * `getWithLinesAndIngredients`'s own null-for-missing-id contract; the page
 * loader calls `notFound()` on that.
 */
export async function getRecipeDetail(id: number): Promise<RecipeDetail | null> {
  const db = createDb();
  try {
    const recipeWithLines = await recipeRepo.getWithLinesAndIngredients(db, id);
    if (!recipeWithLines) {
      return null;
    }

    const { lines, ...recipe } = recipeWithLines;

    const ingredientsById = Object.fromEntries(
      lines.map((line) => [line.ingredient.id, line.ingredient]),
    );

    const nutrition = computeRecipeNutrition(
      {
        id: recipe.id,
        servings: recipe.servings,
        lines: lines.map((line) => ({
          id: line.id,
          ingredientId: line.ingredientId,
          quantityCanonical: line.quantityCanonical,
          entryUnitClass: line.entryUnitClass,
        })),
      },
      ingredientsById,
    );

    return { recipe, lines, nutrition };
  } finally {
    db.$client.close();
  }
}
