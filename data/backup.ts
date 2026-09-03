/**
 * openspec: backup-export — assembles the one-call backup bundle:
 * everything the planner owns, plus best-effort meal-log day rollups
 * from the service. Read-only.
 */
import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { createDb } from "@/data/db";
import { getPantryList } from "@/data/pantry";
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import * as plannerRepo from "@/data/repositories/plannerRepo";
import * as recipeRepo from "@/data/repositories/recipeRepo";
import { getResolvedTargets } from "@/data/nutritionTargets";
import { humanizeMentions, obsidianizeRecipeRefs } from "@/domain/cooklangParser";
import type { BackupBundle, BackupPantryRow, BackupProduct, BackupRecipe } from "@/domain/backupMarkdown";
import { getLogRange, type RangeDayJson } from "@/services/dionysusService";

export interface FullBackup extends BackupBundle {
  planEntries: plannerRepo.PlanEntryRecord[];
  nutritionTargets: Awaited<ReturnType<typeof getResolvedTargets>>;
  /** Trailing-2-years day rollups; null when the service is unreachable. */
  mealLogDays: RangeDayJson[] | null;
  /** Raw product records for lossless restore. */
  productRecords: ingredientRepo.IngredientRecord[];
}

export async function buildFullBackup(): Promise<FullBackup> {
  const db = createDb();
  try {
    const [recipes, ingredients, tagsByRecipeId, derivedByRecipeId, categoriesById, linksById, planEntries] =
      await Promise.all([
        recipeRepo.getAllWithLines(db),
        ingredientRepo.listAll(db),
        recipeRepo.getAllTags(db),
        recipeRepo.getAllDerivedTags(db),
        ingredientRepo.getAllCategories(db),
        ingredientRepo.getAllMerchantLinks(db),
        plannerRepo.getAllEntries(db),
      ]);
    const nameById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
    const recipeNameById = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));

    const backupRecipes: BackupRecipe[] = recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      rating: recipe.rating,
      variantOfName: recipe.variantOfId !== null ? (recipeNameById.get(recipe.variantOfId) ?? null) : null,
      tags: tagsByRecipeId.get(recipe.id) ?? [],
      derivedTags: (derivedByRecipeId.get(recipe.id) ?? []).filter(
        (tag) => !(tagsByRecipeId.get(recipe.id) ?? []).includes(tag),
      ),
      instructions: humanizeMentions(obsidianizeRecipeRefs(recipe.instructions)),
      lines: recipe.lines.map((line) => ({
        displayQuantity: line.displayQuantity,
        displayUnit: line.displayUnit,
        ingredientName: nameById.get(line.ingredientId) ?? `#${line.ingredientId}`,
      })),
    }));

    const backupProducts: BackupProduct[] = ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      category: ingredient.category,
      unitClass: ingredient.unitClass,
      brand: ingredient.brand,
      barcode: ingredient.barcode,
      productId: ingredient.productId,
      readyToEat: ingredient.readyToEat,
      categories: categoriesById.get(ingredient.id) ?? [],
      merchantLinks: linksById.get(ingredient.id) ?? [],
      caloriesPerRef: ingredient.caloriesPerRef,
      proteinPerRef: ingredient.proteinPerRef,
      carbsPerRef: ingredient.carbsPerRef,
      fatPerRef: ingredient.fatPerRef,
    }));

    const pantry: BackupPantryRow[] = (await getPantryList()).map((row) => ({
      ingredientName: row.ingredientName,
      displayQuantity: row.displayQuantity,
      displayUnit: row.displayUnit,
      stockedAt: row.stockedAt ?? null,
    }));

    let mealLogDays: RangeDayJson[] | null = null;
    try {
      const to = todayIsoDateIn(resolveDionysusTimezone());
      const from = `${Number(to.slice(0, 4)) - 2}${to.slice(4)}`;
      mealLogDays = (await getLogRange(resolveDionysusServiceUrl(), from, to)).days;
    } catch {
      mealLogDays = null;
    }

    return {
      exportedAt: new Date().toISOString(),
      recipes: backupRecipes,
      products: backupProducts,
      pantry,
      planEntries,
      nutritionTargets: await getResolvedTargets(),
      mealLogDays,
      productRecords: ingredients,
    };
  } finally {
    db.$client.close();
  }
}
