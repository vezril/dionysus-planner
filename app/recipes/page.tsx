import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { listRecipeSummaries } from "@/data/recipes";
import { RecipeCatalog } from "@/app/recipes/_components/recipe-catalog";

/**
 * Recipe list (S-401 AC1's first real, non-placeholder content; S-404 adds
 * the client-side name search island on top — full search/sort/filter/tag
 * feature set is S-404/S-405/S-406's job). Server Component (ADR-002 —
 * read-only view) rendered fresh on every request (`force-dynamic`) so a
 * recipe saved via `/recipes/new` shows up immediately without relying on
 * client-side cache invalidation timing.
 */
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await listRecipeSummaries();

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
