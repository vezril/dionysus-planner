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
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";
import * as pantryRepo from "@/data/repositories/pantryRepo";
import { computeRecipeNutrition } from "@/domain/nutrition";
import type { RecipeNutrition } from "@/domain/nutrition";
import { computeCookableAndNearMatch } from "@/domain/matching";

export interface RecipeSummary {
  id: number;
  name: string;
  /** S-405 (docs/stories/S-405-recipe-tags.md AC1) — this recipe's own tags. */
  tags: string[];
}

export interface RecipeDetail {
  recipe: RecipeRecord;
  lines: Array<RecipeLineRecord & { ingredient: IngredientRecord }>;
  nutrition: RecipeNutrition;
  /** S-405 — the recipe's current tags, exactly matching what was last saved. */
  tags: string[];
}

export interface RecipeWriteInputPayload {
  name: string;
  servings: number;
  instructions: string;
  lines: RecipeLineInput[];
  /** S-405 — full replace-set tags (see `recipeRepo.RecipeWriteInput.tags`). */
  tags?: string[];
}

/**
 * Delegates straight to `recipeRepo.createWithLines` (one transaction,
 * recipe + all lines together or neither, S-202) — this function performs
 * no validation itself; the calling Server Action owns the Zod re-parse
 * (ADR-005) and the `toCanonical` conversion before calling this.
 */
export async function createRecipeWithLines(
  input: RecipeWriteInputPayload,
): Promise<RecipeRecord & { lines: RecipeLineRecord[]; tags: string[] }> {
  const db = createDb();
  try {
    return await recipeRepo.createWithLines(db, input);
  } finally {
    db.$client.close();
  }
}

/**
 * S-402 data-layer entry points for `app/actions/recipe-actions.ts`'s
 * `updateRecipe`/`deleteRecipe` (docs/stories/S-402-recipe-edit-delete.md).
 * Same per-call `createDb()` pattern as every function in this file — no
 * module-scope singleton, connection closed before returning. Dumb
 * persistence only: the calling action owns the Zod re-validation
 * (ADR-005), the `toCanonical` conversion, and the NOT_FOUND existence
 * check (via `getRecipeRecordById`) before calling these.
 */

export async function getRecipeRecordById(id: number): Promise<RecipeRecord | null> {
  const db = createDb();
  try {
    return await recipeRepo.getById(db, id);
  } finally {
    db.$client.close();
  }
}

export async function updateRecipeWithLines(
  id: number,
  input: RecipeWriteInputPayload,
): Promise<RecipeRecord & { lines: RecipeLineRecord[]; tags: string[] }> {
  const db = createDb();
  try {
    return await recipeRepo.updateWithLines(db, id, input);
  } finally {
    db.$client.close();
  }
}

export async function removeRecipeRecord(id: number): Promise<void> {
  const db = createDb();
  try {
    await recipeRepo.remove(db, id);
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
    const tagsByRecipeId = await recipeRepo.getAllTags(db);
    return recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      tags: tagsByRecipeId.get(recipe.id) ?? [],
    }));
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

    const tags = await recipeRepo.getTags(db, id);

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

    return { recipe, lines, nutrition, tags };
  } finally {
    db.$client.close();
  }
}

export type CookabilityStatus = "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE";

export interface AnnotatedRecipeSummary extends RecipeSummary {
  servings: number;
  caloriesPerServing: number | null;
  cookability: CookabilityStatus;
}

/**
 * S-406 (docs/stories/S-406-recipe-list-sort-filter.md, architecture.md §6
 * Flow D) — the annotated list loader for `app/recipes/page.tsx`. Runs the
 * same two-query scan `data/whatCanICook.ts#getWhatCanICook` runs
 * (`pantryRepo.getAllAsIndex` + `recipeRepo.getAllWithLines`) folded through
 * `domain/matching.computeCookableAndNearMatch` for cookability, plus a bulk
 * ingredient-catalog read folded through `domain/nutrition
 * .computeRecipeNutrition` per recipe for `caloriesPerServing` — the two
 * annotations are computed INDEPENDENTLY of each other. `threshold` is a
 * required, explicit parameter (mirrors `getWhatCanICook`'s own contract);
 * this function does not call `resolveDefaultThreshold()` itself — the
 * caller (`app/recipes/page.tsx`) resolves the default and passes it in
 * (architecture §4 OQ-1). Per ADR-011, nothing is cached: computed fresh on
 * every call. Does not filter/sort/paginate — that's `domain/listFilters
 * .ts#sortRecipes`/`matchesStatus`'s job, client-side.
 */
export async function listRecipeSummariesAnnotated(threshold: number): Promise<AnnotatedRecipeSummary[]> {
  const db = createDb();
  try {
    const recipes = await recipeRepo.getAllWithLines(db);
    const tagsByRecipeId = await recipeRepo.getAllTags(db);
    const pantryIndex = await pantryRepo.getAllAsIndex(db);
    const ingredients = await ingredientRepo.listAll(db);

    const ingredientsById = Object.fromEntries(ingredients.map((ingredient) => [ingredient.id, ingredient]));

    const matchResult = computeCookableAndNearMatch(pantryIndex, recipes, threshold);
    const cookabilityByRecipeId = new Map<number, CookabilityStatus>();
    for (const recipe of matchResult.cookable) {
      cookabilityByRecipeId.set(recipe.id, "COOKABLE");
    }
    for (const recipe of matchResult.nearMatch) {
      cookabilityByRecipeId.set(recipe.id, "NEAR_MATCH");
    }

    return recipes.map((recipe) => {
      const nutrition = computeRecipeNutrition(
        {
          id: recipe.id,
          servings: recipe.servings,
          lines: recipe.lines.map((line) => ({
            id: line.id,
            ingredientId: line.ingredientId,
            quantityCanonical: line.quantityCanonical,
            entryUnitClass: line.entryUnitClass,
          })),
        },
        ingredientsById,
      );

      return {
        id: recipe.id,
        name: recipe.name,
        tags: tagsByRecipeId.get(recipe.id) ?? [],
        servings: recipe.servings,
        caloriesPerServing: nutrition.perServing.calories.value,
        cookability: cookabilityByRecipeId.get(recipe.id) ?? "MISSING_MORE",
      };
    });
  } finally {
    db.$client.close();
  }
}
