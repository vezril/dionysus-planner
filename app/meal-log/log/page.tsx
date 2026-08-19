import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { listBatches, listIngredients, listRecipes } from "@/services/dionysusService";
import { LogMealForm } from "./_components/LogMealForm";

/**
 * openspec: meal-log-integration — log a meal against dionysus-service.
 */
export const dynamic = "force-dynamic";

export default async function LogMealPage() {
  const baseUrl = resolveDionysusServiceUrl();
  const [batches, ingredients, recipes] = await Promise.all([
    listBatches(baseUrl),
    listIngredients(baseUrl),
    listRecipes(baseUrl),
  ]);
  const recipeNameByBatchId = new Map(
    batches.map((batch) => {
      const recipe = recipes.find((r) => r.id === batch.recipeId);
      return [batch.recipeId, recipe?.name ?? `Recipe #${batch.recipeId}`] as const;
    }),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Log a Meal</h1>

      {batches.length === 0 && ingredients.filter((i) => i.directlyLoggable).length === 0 ? (
        <p data-testid="log-meal-nothing-to-log" className="text-sm text-muted-foreground">
          Nothing to log yet — cook a batch or add a directly-loggable ingredient first.
        </p>
      ) : (
        <LogMealForm batches={batches} ingredients={ingredients} recipeNameByBatchId={recipeNameByBatchId} />
      )}
    </div>
  );
}
