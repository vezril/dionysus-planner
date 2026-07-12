import Link from "next/link";
import { getWhatCanICook } from "@/data/whatCanICook";
import { getIngredientCatalog } from "@/data/ingredients";
import { resolveDefaultThreshold } from "@/app/lib/threshold";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { NearMatchPanel } from "./_components/near-match-panel";

/**
 * "What Can I Cook" — the app's front door (docs/stories/S-501-what-can-
 * i-cook.md, architecture.md §6 Flow C). RSC: `data/whatCanICook
 * .getWhatCanICook` runs the two-query fetch + `domain/matching
 * .computeCookableAndNearMatch` (threshold resolved here, in the app
 * layer, via `resolveDefaultThreshold()` — the domain/data layers never
 * read `process.env`, architecture §4 OQ-1). Computed fresh on every
 * request — no caching/invalidation step (ADR-011), hence `force-dynamic`
 * (same rationale as `app/recipes/[id]/page.tsx`, S-403).
 *
 * Ingredient names for the unsatisfied-line captions aren't part of
 * `getWhatCanICook`'s two-query contract (its `RecipeLine`s carry
 * `ingredientId` + the joined `unitClass`/`densityGPerMl` density fields
 * only, per Flow C — no name). This page fetches the ingredient catalog
 * separately (`data/ingredients#getIngredientCatalog`, already the
 * reusable catalog reader for the ingredient picker) to build an
 * id -> name lookup for that rendering-only need, without adding a third
 * query to the wiring function itself.
 *
 * Flow C's render rule (NFR-2): recipes beyond the active threshold are
 * summarized by count only (`missing-more-tail`) — never rendered as rows.
 *
 * FR-29: an empty Cookable Now section (nothing fully stocked yet —
 * including the true first-run "zero recipes, zero pantry items" case)
 * renders the shared `EmptyState` with a real CTA (link to `/pantry`), the
 * same bar `/pantry` and `/recipes` already hold themselves to, rather than
 * descriptive-only prose with no actionable control.
 *
 * S-502: the Near Match section + missing-more tail + threshold control
 * live in `NearMatchPanel`, a client island (ADR-002) seeded with this RSC
 * render's result and re-fetching `/api/what-can-i-cook?threshold=` on
 * change (ADR-004) — the `h1` and Cookable Now section above stay
 * server-rendered and never re-render on a threshold change (no
 * navigation, §6 Flow C).
 */
export const dynamic = "force-dynamic";

export default async function WhatCanICookPage() {
  const threshold = resolveDefaultThreshold();
  const [result, catalog] = await Promise.all([getWhatCanICook(threshold), getIngredientCatalog()]);

  const ingredientNames = Object.fromEntries(catalog.map((entry) => [entry.id, entry.name]));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">What Can I Cook</h1>

      <section data-testid="cookable-now-section" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-status-cookable">Cookable Now</h2>
        {result.cookable.length === 0 ? (
          <EmptyState description="Nothing is fully stocked yet — check Near Match below, or add pantry items to get there.">
            <Button asChild>
              <Link href="/pantry">Add pantry items</Link>
            </Button>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {result.cookable.map((recipe) => (
              <li
                key={recipe.id}
                data-testid="cookable-recipe-row"
                className="rounded-lg border border-status-cookable/40 p-4"
              >
                <Link href={`/recipes/${recipe.id}`} className="font-medium underline underline-offset-2">
                  {recipe.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NearMatchPanel
        initialThreshold={threshold}
        initialNearMatch={result.nearMatch}
        initialMissingMoreCount={result.missingMoreCount}
        ingredientNames={ingredientNames}
      />
    </div>
  );
}
