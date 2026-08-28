import { resolveDionysusServiceUrl } from "@/app/lib/dionysusServiceConfig";
import { formatInstantIn, resolveDionysusTimezone } from "@/app/lib/dionysusTimezone";
import { getPlannedPortionsByBatch } from "@/data/planner";
import { listBatches, listRecipes } from "@/services/dionysusService";
import { CookBatchForm } from "./_components/CookBatchForm";
import { LogPortionButton } from "./_components/LogPortionButton";
import { formatQuantity } from "@/domain/quantityFormat";

/**
 * openspec: meal-log-integration — dionysus-service batches (cook events).
 * Immutable once created; no edit page.
 */
export const dynamic = "force-dynamic";

export default async function MealLogBatchesPage() {
  const baseUrl = resolveDionysusServiceUrl();
  const timeZone = resolveDionysusTimezone();
  const [batches, recipes, plannedByBatch] = await Promise.all([
    listBatches(baseUrl),
    listRecipes(baseUrl),
    getPlannedPortionsByBatch(),
  ]);
  const recipeNameById = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Inventory Batches</h1>

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
                cooked {formatInstantIn(batch.cookedAt, timeZone)} · {formatQuantity(batch.remainingPortions)} portions remaining
                {/* openspec: planner-consume — reservations are visible, never deducted. */}
                {batch.id !== null && (plannedByBatch.get(batch.id) ?? 0) > 0 ? (
                  <span data-testid="batch-planned" className="text-status-near">
                    {" "}
                    · {formatQuantity(plannedByBatch.get(batch.id) ?? 0)} planned
                  </span>
                ) : null}
              </span>
              {/* openspec: eat-now-and-quick-log — leftovers, one click. */}
              {batch.remainingPortions >= 1 && batch.id !== null ? (
                <LogPortionButton batchId={batch.id} />
              ) : null}
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
