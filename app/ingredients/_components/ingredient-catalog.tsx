"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { SortButton } from "@/components/SortButton";
import type { IngredientSummary } from "@/data/ingredients";
import { nextSortState, sortRows, type SortState, type SortValue } from "@/domain/listSort";
import { buildCategoryTree, pruneTreeByQuery, type CategoryNode } from "@/domain/categoryTree";

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
// openspec: sortable-columns — column-title sort keys.
const PICKERS: Record<string, (ingredient: IngredientSummary) => SortValue> = {
  name: (ingredient) => ingredient.name,
  calories: (ingredient) => ingredient.caloriesPerRef,
  category: (ingredient) => ingredient.category,
};

// openspec: category-tree — nested browse view, products as leaf links.
function CategoryBranch({ node, depth }: { node: CategoryNode; depth: number }) {
  return (
    <details open data-testid="category-node" className={depth === 0 ? "" : "ml-4"}>
      <summary className="cursor-pointer py-1 text-sm font-medium text-foreground hover:text-primary">
        {node.name}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {node.products.length > 0 ? node.products.length : ""}
        </span>
      </summary>
      {node.children.map((child) => (
        <CategoryBranch key={child.name} node={child} depth={depth + 1} />
      ))}
      <ul className="ml-4 flex flex-col">
        {node.products.map((product) => (
          <li key={`${node.name}-${product.id}`} data-testid="category-product" className="py-0.5">
            <Link
              href={`/ingredients/${product.id}/edit`}
              className="text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              {product.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function IngredientCatalog({ ingredients }: { ingredients: IngredientSummary[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [view, setView] = useState<"list" | "tree">("list");
  const tree = useMemo(
    () => pruneTreeByQuery(buildCategoryTree(ingredients), query),
    [ingredients, query],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched =
      needle === "" ? ingredients : ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(needle));
    if (sort === null) return matched;
    return sortRows(matched, PICKERS[sort.key] ?? PICKERS.name, sort.direction);
  }, [ingredients, query, sort]);

  const header = (key: string, label: string) => (
    <SortButton
      label={label}
      active={sort?.key === key}
      direction={sort?.key === key ? sort.direction : "asc"}
      onClick={() => setSort((current) => nextSortState(current, key))}
    />
  );

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

      {/* openspec: category-tree — view toggle. */}
      <div className="flex gap-2">
        {(["list", "tree"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            data-testid={`view-${candidate}`}
            aria-pressed={view === candidate}
            onClick={() => setView(candidate)}
            className={`rounded-md border px-3 py-1 text-sm font-medium ${
              view === candidate ? "border-primary text-primary" : "border-border text-foreground hover:border-primary/40"
            }`}
          >
            {candidate === "list" ? "List" : "By category"}
          </button>
        ))}
      </div>

      {view === "tree" ? (
        <div data-testid="category-tree" className="flex flex-col gap-1">
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products match.</p>
          ) : (
            tree.map((node) => <CategoryBranch key={node.name} node={node} depth={0} />)
          )}
        </div>
      ) : (
        <>
      {/* openspec: sortable-columns */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-2">
        {header("name", "Name")}
        {header("calories", "Calories")}
        {header("category", "Category")}
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
                {ingredient.category !== "FOOD" ? (
                  <span
                    data-testid="category-badge"
                    className="rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {ingredient.category}
                  </span>
                ) : null}
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
        </>
      )}
    </div>
  );
}
