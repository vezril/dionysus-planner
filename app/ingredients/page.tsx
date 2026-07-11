import Link from "next/link";
import { getIngredientCatalog } from "@/data/ingredients";
import { IngredientCatalog } from "@/app/ingredients/_components/ingredient-catalog";

/**
 * S-301: RSC full catalog + client search island (ADR-002). Fetches the
 * complete catalog directly through the data layer — never through
 * `/api/ingredients` (ADR-004: initial page loads never self-HTTP-call the
 * Route Handler that exists for client-driven reads). No pagination at
 * NFR-3 scale (architecture.md §6 "Lists render in full").
 *
 * Forced dynamic: migrate-then-seed (architecture.md §6 Flow A) runs from
 * `instrumentation.ts` at server *boot*, not at `next build` time — a
 * statically-prerendered version of this page would execute against
 * whatever (possibly nonexistent/empty) DB happens to be on disk during
 * the build step. Rendering per-request instead guarantees this always
 * reads the post-boot, fully-seeded DB (ADR-011's "compute fresh on every
 * view" stance, applied here too).
 */
export const dynamic = "force-dynamic";

export default async function IngredientsPage() {
  const ingredients = await getIngredientCatalog();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Ingredients</h1>
        <Link href="/ingredients/new" className="text-sm font-medium text-primary hover:underline">
          Add ingredient
        </Link>
      </div>
      <IngredientCatalog ingredients={ingredients} />
    </div>
  );
}
