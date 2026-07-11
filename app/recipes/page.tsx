import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { listRecipeSummariesAnnotated } from "@/data/recipes";
import { resolveDefaultThreshold } from "@/app/lib/threshold";
import { RecipeCatalog } from "@/app/recipes/_components/recipe-catalog";

/**
 * Recipe list (S-401 AC1's first real, non-placeholder content; S-404 adds
 * the client-side name search island; S-406 upgrades the loader to
 * architecture.md §6 Flow D in full — every recipe annotated server-side
 * with its cookability status and calories/serving via
 * `data/recipes.ts#listRecipeSummariesAnnotated`, threshold resolved here in
 * the app layer via `resolveDefaultThreshold()` — the domain/data layers
 * never read `process.env`, architecture §4 OQ-1). Server Component
 * (ADR-002 — read-only view) rendered fresh on every request
 * (`force-dynamic`) so a recipe saved via `/recipes/new` shows up
 * immediately without relying on client-side cache invalidation timing, and
 * so cookability/nutrition are always computed fresh against the current
 * pantry (ADR-011 — no caching).
 */
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const threshold = resolveDefaultThreshold();
  const recipes = await listRecipeSummariesAnnotated(threshold);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Recipes</h1>
      {recipes.length === 0 ? (
        <EmptyState description="No recipes yet — add your first recipe to start tracking nutrition and cookability.">
          <Button asChild>
            <Link href="/recipes/new">Add your first recipe</Link>
          </Button>
        </EmptyState>
      ) : (
        <RecipeCatalog recipes={recipes} />
      )}
    </div>
  );
}
