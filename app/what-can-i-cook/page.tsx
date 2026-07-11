import Link from "next/link";
import { getWhatCanICook } from "@/data/whatCanICook";
import { getIngredientCatalog } from "@/data/ingredients";
import { resolveDefaultThreshold } from "@/app/lib/threshold";
import type { RankedRecipe, UnsatisfiedLine } from "@/domain/matching";

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
 */
export const dynamic = "force-dynamic";

function formatQuantity(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function UnsatisfiedLineText({ line, nameFor }: { line: UnsatisfiedLine; nameFor: (id: number) => string }) {
  const name = nameFor(line.ingredientId);

  if (line.status === "UNRESOLVED") {
    return <>{`${name}: unresolved — cannot compare units`}</>;
  }

  return <>{`need ${formatQuantity(line.shortfallDisplayQuantity)} ${line.displayUnit} more ${name}`}</>;
}

function NearMatchRow({ recipe, nameFor }: { recipe: RankedRecipe; nameFor: (id: number) => string }) {
  return (
    <li data-testid="near-match-recipe-row" className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <Link href={`/recipes/${recipe.id}`} className="font-medium underline underline-offset-2">
        {recipe.name}
      </Link>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {recipe.unsatisfiedLines.map((line) => (
          <li key={line.ingredientId} data-testid="unsatisfied-line">
            <UnsatisfiedLineText line={line} nameFor={nameFor} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export default async function WhatCanICookPage() {
  const threshold = resolveDefaultThreshold();
  const [result, catalog] = await Promise.all([getWhatCanICook(threshold), getIngredientCatalog()]);

  const ingredientNameById = new Map(catalog.map((entry) => [entry.id, entry.name]));
  const nameFor = (id: number) => ingredientNameById.get(id) ?? "an ingredient";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">What Can I Cook</h1>

      <section data-testid="cookable-now-section" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Cookable Now</h2>
        {result.cookable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is fully stocked yet — check Near Match below, or add pantry items.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {result.cookable.map((recipe) => (
              <li
                key={recipe.id}
                data-testid="cookable-recipe-row"
                className="rounded-lg border border-border p-4"
              >
                <Link href={`/recipes/${recipe.id}`} className="font-medium underline underline-offset-2">
                  {recipe.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="near-match-section" className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Near Match</h2>
        {result.nearMatch.length === 0 ? (
          <p className="text-sm text-muted-foreground">No near matches right now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.nearMatch.map((recipe) => (
              <NearMatchRow key={recipe.id} recipe={recipe} nameFor={nameFor} />
            ))}
          </ul>
        )}
      </section>

      <div data-testid="missing-more-tail" className="text-sm text-muted-foreground">
        <span data-testid="missing-more-count">{result.missingMoreCount}</span>{" "}
        {result.missingMoreCount === 1 ? "recipe needs" : "recipes need"} too many ingredients to show here.
      </div>
    </div>
  );
}
