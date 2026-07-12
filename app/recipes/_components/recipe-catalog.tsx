"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  filterByNameSubstring,
  filterByTagsAll,
  matchesStatus,
  sortRecipes,
  type CookabilityStatusFilter,
  type RecipeSortKey,
  type SortDirection,
} from "@/domain/listFilters";
import type { AnnotatedRecipeSummary, CookabilityStatus } from "@/data/recipes";

const SORT_BY_OPTIONS: Array<{ value: RecipeSortKey; label: string }> = [
  { value: "name", label: "Name" },
  { value: "servings", label: "Servings" },
  { value: "caloriesPerServing", label: "Calories per serving" },
];

const SORT_DIRECTION_OPTIONS: Array<{ value: SortDirection; label: string }> = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
];

const COOKABILITY_FILTER_OPTIONS: Array<{ value: CookabilityStatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "COOKABLE", label: "Cookable Now" },
  { value: "NEAR_MATCH", label: "Near Match" },
  { value: "MISSING_MORE", label: "Missing More" },
];

// ui-theme: status colors are semantic tokens (design.md Decision 3); glow
// allowlist includes status badges (Decision 4).
const COOKABILITY_BADGE_CLASS: Record<string, string> = {
  COOKABLE: "border-status-cookable/60 text-status-cookable glow-cookable",
  NEAR_MATCH: "border-status-near/60 text-status-near glow-near",
  MISSING_MORE: "border-border text-muted-foreground",
};

const COOKABILITY_BADGE_LABEL: Record<CookabilityStatus, string> = {
  COOKABLE: "Cookable Now",
  NEAR_MATCH: "Near Match",
  MISSING_MORE: "Missing More",
};

/**
 * Client search/sort/filter island (ADR-002 — ONLY this list island is a
 * client component; the initial render is still the server-rendered HTML
 * for the full list, since Next.js SSRs this component using the `recipes`
 * prop passed straight from the RSC page — no self-HTTP-call on first load,
 * per ADR-004/the story's Dev Notes). Mirrors
 * `app/ingredients/_components/ingredient-catalog.tsx`'s S-301 precedent.
 *
 * Filtering/sorting is client-side, in-memory, over the already-loaded
 * server-annotated list (architecture.md §6 Flow D) via `domain/listFilters
 * .ts`'s pure helpers — the matching/ordering logic itself is unit-tested in
 * isolation there; this component only wires it to controlled inputs:
 * `filterByNameSubstring` (S-404 name search), `filterByTagsAll` (S-405 tag
 * chips), `matchesStatus` (S-406 cookability filter combobox), and
 * `sortRecipes` (S-406 sort-by/sort-direction comboboxes) all compose in
 * sequence, without a server round-trip (S-406 AC4).
 */
export function RecipeCatalog({ recipes }: { recipes: AnnotatedRecipeSummary[] }) {
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<RecipeSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [statusFilter, setStatusFilter] = useState<CookabilityStatusFilter>("ALL");

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
    const byTags = filterByTagsAll(byName, selectedTags);
    const byStatus = byTags.filter((recipe) => matchesStatus(recipe, statusFilter));
    return sortRecipes(byStatus, sortKey, sortDirection);
  }, [recipes, query, selectedTags, statusFilter, sortKey, sortDirection]);

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

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Sort by</span>
          <Select value={sortKey} onValueChange={(value) => setSortKey(value as RecipeSortKey)}>
            <SelectTrigger aria-label="Sort by" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_BY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Sort direction</span>
          <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as SortDirection)}>
            <SelectTrigger aria-label="Sort direction" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_DIRECTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Cookability</span>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as CookabilityStatusFilter)}
          >
            <SelectTrigger aria-label="Cookability" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COOKABILITY_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p data-testid="recipe-no-results" className="text-sm text-muted-foreground">
          No recipes match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map((recipe) => (
            <li key={recipe.id} data-testid="recipe-row" className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/recipes/${recipe.id}`} className="font-medium text-foreground hover:underline">
                  {recipe.name}
                </Link>
                <span
                  data-testid="cookability-badge"
                  className={`rounded-full border bg-muted px-2 py-0.5 text-xs ${COOKABILITY_BADGE_CLASS[recipe.cookability]}`}
                >
                  {COOKABILITY_BADGE_LABEL[recipe.cookability]}
                </span>
              </div>
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
