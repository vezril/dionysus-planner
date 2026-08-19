import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { listBatches, listRecipes } from "@/services/dionysusService";
import { CookBatchForm } from "./_components/CookBatchForm";

/**
 * openspec: meal-log-integration — dionysus-service batches (cook events).
 * Immutable once created; no edit page.
 */
export const dynamic = "force-dynamic";

export default async function MealLogBatchesPage() {
  const baseUrl = resolveDionysusServiceUrl();
  const [batches, recipes] = await Promise.all([listBatches(baseUrl), listRecipes(baseUrl)]);
  const recipeNameById = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Meal Log Batches</h1>

      {batches.length === 0 ? (
        <p data-testid="meal-log-batches-empty" className="text-sm text-muted-foreground">
          No batches yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" data-testid="meal-log-batch-list">
          {batches.map((batch) => (
            <li
              key={batch.id}
              data-testid="meal-log-batch-row"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
            >
              <span className="font-medium">
                {recipeNameById.get(batch.recipeId) ?? `Recipe #${batch.recipeId}`}
              </span>
              <span className="text-sm text-muted-foreground">
                cooked {new Date(batch.cookedAt).toLocaleString()} · {batch.remainingPortions} portions remaining
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-lg font-semibold">Cook a batch</h2>
      {recipes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a recipe first — a batch needs one to reference.
        </p>
      ) : (
        <CookBatchForm recipes={recipes} />
      )}
    </div>
  );
}
