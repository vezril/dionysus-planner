"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { IngredientSummary } from "@/data/ingredients";

/**
 * Client search island (ADR-002 — ONLY the search box + its filtered list
 * are a client component; the initial render is still the server-rendered
 * HTML for the full catalog, since Next.js SSRs this component using the
 * `ingredients` prop passed straight from the RSC page — no self-HTTP-call
 * on first load, per ADR-004/the story's Dev Notes).
 *
 * Filtering is client-side, in-memory, over the already-loaded list
 * (case-insensitive substring on `name`) — satisfies FR-5's 300 ms budget
 * trivially at this ~2,000-row ceiling (architecture.md §6 Flow D's same
 * "no round-trip per keystroke" argument) and keeps this the reusable
 * shape for later pickers without adding a debounced-fetch code path this
 * story doesn't need.
 */
export function IngredientCatalog({ ingredients }: { ingredients: IngredientSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return ingredients;
    return ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(needle));
  }, [ingredients, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="ingredient-search" className="text-sm font-medium text-foreground">
          Search ingredients
        </label>
        <Input
          id="ingredient-search"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
          className="max-w-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p data-testid="ingredient-no-results" className="text-sm text-muted-foreground">
          No ingredients match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map((ingredient) => (
            <li
              key={ingredient.id}
              data-testid="ingredient-row"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
            >
              <Link
                href={`/ingredients/${ingredient.id}/edit`}
                className="font-medium text-foreground hover:underline"
              >
                {ingredient.name}
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{ingredient.unitClass}</span>
                <span>{ingredient.caloriesPerRef} kcal</span>
                <span>{ingredient.proteinPerRef}g protein</span>
                <span>{ingredient.carbsPerRef}g carbs</span>
                <span>{ingredient.fatPerRef}g fat</span>
                <span
                  data-testid="source-badge"
                  className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground"
                >
                  {ingredient.source}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
