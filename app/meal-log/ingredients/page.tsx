import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { listIngredients } from "@/services/dionysusService";
import { MealLogIngredientForm } from "./_components/MealLogIngredientForm";

/**
 * openspec: meal-log-integration — dionysus-service's ingredient catalog,
 * management from within dionysus-planner. Deliberately titled/labeled to
 * distinguish this from dionysus-planner's OWN `/ingredients` page (design.md
 * risk mitigation) — these are two separate catalogs, two separate ID
 * spaces, never conflated.
 */
export const dynamic = "force-dynamic";

export default async function MealLogIngredientsPage() {
  const baseUrl = resolveDionysusServiceUrl();
  const ingredients = await listIngredients(baseUrl);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Meal Log Ingredients</h1>
      <p className="text-sm text-muted-foreground">
        The ingredient catalog for the Meal Log section (dionysus-service) — separate from this app&apos;s
        own <span className="font-medium">Ingredients</span> page.
      </p>

      {ingredients.length === 0 ? (
        <p data-testid="meal-log-ingredients-empty" className="text-sm text-muted-foreground">
          No ingredients yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" data-testid="meal-log-ingredient-list">
          {ingredients.map((ingredient) => (
            <li
              key={ingredient.id}
              data-testid="meal-log-ingredient-row"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="font-medium">{ingredient.name}</span>
              <span className="text-sm text-muted-foreground">
                {ingredient.sodiumMg}mg sodium{ingredient.directlyLoggable ? " · directly loggable" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-lg font-semibold">Add an ingredient</h2>
      <MealLogIngredientForm />
    </div>
  );
}
