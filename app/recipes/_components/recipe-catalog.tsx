"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { filterByNameSubstring, filterByTagsAll } from "@/domain/listFilters";
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
 *
 * S-405 (docs/stories/S-405-recipe-tags.md AC2, tests/e2e/recipe-tags.spec.ts)
 * adds a tag filter on top, composing with the name search: both
 * `filterByNameSubstring` and `filterByTagsAll` apply in sequence, over the
 * same already-loaded list — the tag-AND intersection logic itself is
 * unit-tested in isolation at `domain/listFilters.ts`; this component only
 * wires it to clickable, toggleable tag chips.
 */
export function RecipeCatalog({ recipes }: { recipes: RecipeSummary[] }) {
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const recipe of recipes) {
      for (const tag of recipe.tags) {
        seen.add(tag);
      }
    }
    return [...seen];
  }, [recipes]);

  const filtered = useMemo(() => {
    const byName = filterByNameSubstring(recipes, query);
    return filterByTagsAll(byName, selectedTags);
  }, [recipes, query, selectedTags]);

  function toggleTag(tag: string) {
    setSelectedTags((previous) =>
      previous.includes(tag) ? previous.filter((existing) => existing !== tag) : [...previous, tag],
    );
  }

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

      {allTags.length > 0 ? (
        <div data-testid="tag-filter" className="flex flex-wrap gap-2">
          {allTags.map((tag) => {
            const pressed = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                data-testid="tag-filter-chip"
                aria-pressed={pressed}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-2.5 py-1 text-sm ${
                  pressed
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-foreground"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      ) : null}

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
              {recipe.tags.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {recipe.tags.map((tag) => (
                    <span
                      key={tag}
                      data-testid="recipe-row-tag"
                      className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
