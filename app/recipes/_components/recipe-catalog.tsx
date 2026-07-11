"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { filterByNameSubstring } from "@/domain/listFilters";
import type { RecipeSummary } from "@/data/recipes";

/**
 * Client search island (ADR-002 — ONLY the search box + its filtered list
 * are a client component; the initial render is still the server-rendered
 * HTML for the full list, since Next.js SSRs this component using the
 * `recipes` prop passed straight from the RSC page — no self-HTTP-call on
 * first load, per ADR-004/the story's Dev Notes). Mirrors
 * `app/ingredients/_components/ingredient-catalog.tsx`'s S-301 precedent.
 *
 * Filtering is client-side, in-memory, over the already-loaded list via
 * `domain/listFilters.ts#filterByNameSubstring` — the matching logic itself
 * is unit-tested in isolation there; this component only wires it to a
 * controlled `<input>` (docs/stories/S-404-recipe-list-search.md, no
 * per-keystroke round-trip per architecture.md §6 Flow D).
 */
export function RecipeCatalog({ recipes }: { recipes: RecipeSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterByNameSubstring(recipes, query), [recipes, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="recipe-search" className="text-sm font-medium text-foreground">
          Search recipes
        </label>
        <Input
          id="recipe-search"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
          className="max-w-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p data-testid="recipe-no-results" className="text-sm text-muted-foreground">
          No recipes match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map((recipe) => (
            <li key={recipe.id} data-testid="recipe-row" className="py-3">
              <Link href={`/recipes/${recipe.id}`} className="font-medium text-foreground hover:underline">
                {recipe.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
