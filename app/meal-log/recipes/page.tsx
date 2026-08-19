import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { listIngredients, listRecipes } from "@/services/dionysusService";
import { MealLogRecipeForm } from "./_components/MealLogRecipeForm";

/**
 * openspec: meal-log-integration — dionysus-service recipes, management
 * from within dionysus-planner. Flat ID-referenced ingredient lines, not
 * the Cooklang mention editor (design.md Decision 5).
 */
export const dynamic = "force-dynamic";

export default async function MealLogRecipesPage() {
  const baseUrl = resolveDionysusServiceUrl();
  const [recipes, ingredients] = await Promise.all([listRecipes(baseUrl), listIngredients(baseUrl)]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Meal Log Recipes</h1>

      {recipes.length === 0 ? (
        <p data-testid="meal-log-recipes-empty" className="text-sm text-muted-foreground">
          No recipes yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" data-testid="meal-log-recipe-list">
          {recipes.map((recipe) => (
            <li
              key={recipe.id}
              data-testid="meal-log-recipe-row"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="font-medium">
                {recipe.name} <span className="text-sm text-muted-foreground">({recipe.servings} servings)</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {recipe.perServingNutrition.sodiumMg}mg sodium/serving
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-lg font-semibold">Add a recipe</h2>
      {ingredients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add an ingredient first — a recipe needs at least one to reference.
        </p>
      ) : (
        <MealLogRecipeForm ingredients={ingredients} />
      )}
    </div>
  );
}
