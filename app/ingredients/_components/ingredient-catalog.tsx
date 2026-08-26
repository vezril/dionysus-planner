"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { SortButton } from "@/components/SortButton";
import type { IngredientSummary } from "@/data/ingredients";
import { nextSortState, sortRows, type SortState, type SortValue } from "@/domain/listSort";
import { buildCategoryTree, pruneTreeByQuery, type CategoryNode } from "@/domain/categoryTree";
import { clearCategoryDefaults, setCategoryDefaults } from "@/app/actions/category-defaults-actions";
import { normalizeCategoryPath, type CategoryDefaults } from "@/domain/categoryDefaults";
import { useRouter } from "next/navigation";

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
// openspec: category-defaults — per-node defaults editor state lives on
// the catalog; the branch renders the chip + editor for its own path.
interface DefaultsApi {
  defaultsByPath: Record<string, CategoryDefaults>;
  editingPath: string | null;
  setEditingPath: (path: string | null) => void;
}

function DefaultsEditor({ displayPath, current, onClose }: { displayPath: string; current: CategoryDefaults | undefined; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => ({
    caloriesPerRef: current?.caloriesPerRef?.toString() ?? "",
    proteinPerRef: current?.proteinPerRef?.toString() ?? "",
    carbsPerRef: current?.carbsPerRef?.toString() ?? "",
    fatPerRef: current?.fatPerRef?.toString() ?? "",
    alcoholAbvPercent: current?.alcoholAbvPercent?.toString() ?? "",
  }));
  const [message, setMessage] = useState<string | null>(null);
  const FIELDS: Array<[string, string]> = [
    ["caloriesPerRef", "kcal"],
    ["proteinPerRef", "protein g"],
    ["carbsPerRef", "carbs g"],
    ["fatPerRef", "fat g"],
    ["alcoholAbvPercent", "% ABV"],
  ];
  return (
    <div data-testid="category-defaults-editor" className="my-1 ml-4 flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
      {FIELDS.map(([key, label]) => (
        <label key={key} className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {label}
          <input
            type="number"
            step="any"
            aria-label={`Default ${label}`}
            className="w-20 rounded-md border border-input bg-background px-1.5 py-1 text-sm text-foreground"
            value={values[key]}
            onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))}
          />
        </label>
      ))}
      <button
        type="button"
        data-testid="category-defaults-save"
        className="rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary"
        onClick={async () => {
          const toNumber = (raw: string) => (raw.trim() === "" ? null : Number(raw));
          const result = await setCategoryDefaults({
            displayPath,
            caloriesPerRef: toNumber(values.caloriesPerRef),
            proteinPerRef: toNumber(values.proteinPerRef),
            carbsPerRef: toNumber(values.carbsPerRef),
            fatPerRef: toNumber(values.fatPerRef),
            alcoholAbvPercent: toNumber(values.alcoholAbvPercent),
          });
          if (!result.ok) { setMessage(result.message ?? "Failed."); return; }
          onClose();
          router.refresh();
        }}
      >
        Save defaults
      </button>
      <button
        type="button"
        data-testid="category-defaults-clear"
        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
        onClick={async () => {
          await clearCategoryDefaults(displayPath);
          onClose();
          router.refresh();
        }}
      >
        Clear
      </button>
      {message ? <span className="text-xs text-destructive">{message}</span> : null}
    </div>
  );
}

function CategoryBranch({ node, depth, parentPath, api }: { node: CategoryNode; depth: number; parentPath: string; api: DefaultsApi }) {
  const displayPath = parentPath === "" ? node.name : `${parentPath}/${node.name}`;
  const normalized = normalizeCategoryPath(displayPath);
  const current = api.defaultsByPath[normalized];
  return (
    <details open data-testid="category-node" className={depth === 0 ? "" : "ml-4"}>
      <summary className="cursor-pointer py-1 text-sm font-medium text-foreground hover:text-primary">
        {node.name}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {node.products.length > 0 ? node.products.length : ""}
        </span>
        {/* openspec: category-defaults */}
        {current?.caloriesPerRef != null ? (
          <span data-testid="category-defaults-chip" className="ml-2 rounded-full border border-primary/40 px-1.5 py-0.5 text-xs font-normal text-primary">
            {current.caloriesPerRef} kcal
          </span>
        ) : null}
        <button
          type="button"
          data-testid="category-defaults-toggle"
          className="ml-2 text-xs font-normal text-muted-foreground underline hover:text-primary"
          onClick={(event) => {
            event.preventDefault();
            api.setEditingPath(api.editingPath === normalized ? null : normalized);
          }}
        >
          defaults
        </button>
      </summary>
      {api.editingPath === normalized ? (
        <DefaultsEditor displayPath={displayPath} current={current} onClose={() => api.setEditingPath(null)} />
      ) : null}
      {node.children.map((child) => (
        <CategoryBranch key={child.name} node={child} depth={depth + 1} parentPath={displayPath} api={api} />
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

export function IngredientCatalog({
  ingredients,
  categoryDefaults,
}: {
  ingredients: IngredientSummary[];
  categoryDefaults: Record<string, CategoryDefaults>;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [view, setView] = useState<"list" | "tree">("list");
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const defaultsApi: DefaultsApi = { defaultsByPath: categoryDefaults, editingPath, setEditingPath };
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

  const header = (key: string, label: string, className = "") => (
    <SortButton
      label={label}
      active={sort?.key === key}
      direction={sort?.key === key ? sort.direction : "asc"}
      onClick={() => setSort((current) => nextSortState(current, key))}
      className={className}
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
            tree.map((node) => <CategoryBranch key={node.name} node={node} depth={0} parentPath="" api={defaultsApi} />)
          )}
        </div>
      ) : (
        <>
      {/* openspec: sortable-columns + product-columns — the header sits
          on the same grid tracks as the rows. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-2 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_5rem_4.5rem_4.5rem_4.5rem_max-content] sm:gap-x-3">
        {header("name", "Name")}
        <span aria-hidden className="hidden sm:block" />
        {header("calories", "Calories", "sm:justify-self-end")}
        <span aria-hidden className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground sm:block sm:justify-self-end">
          Protein
        </span>
        <span aria-hidden className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground sm:block sm:justify-self-end">
          Carbs
        </span>
        <span aria-hidden className="hidden text-right text-xs uppercase tracking-wide text-muted-foreground sm:block sm:justify-self-end">
          Fat
        </span>
        {header("category", "Category", "sm:justify-self-end")}
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
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_5rem_4.5rem_4.5rem_4.5rem_max-content] sm:gap-x-3"
            >
              <Link
                href={`/ingredients/${ingredient.id}/edit`}
                className="min-w-0 break-words font-medium text-foreground hover:underline"
              >
                {ingredient.name}
              </Link>
              {/* openspec: product-columns — per-100 numbers as aligned,
                  right-justified tabular columns on sm+. */}
              <span className="hidden text-xs text-muted-foreground sm:block">{ingredient.unitClass}</span>
              <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block sm:text-right">
                {ingredient.caloriesPerRef} kcal
              </span>
              <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block sm:text-right">
                {ingredient.proteinPerRef} g
              </span>
              <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block sm:text-right">
                {ingredient.carbsPerRef} g
              </span>
              <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block sm:text-right">
                {ingredient.fatPerRef} g
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-self-end">
                <span className="sm:hidden">{ingredient.unitClass}</span>
                <span className="sm:hidden">{ingredient.caloriesPerRef} kcal</span>
                <span className="sm:hidden">{ingredient.proteinPerRef}g protein</span>
                <span className="sm:hidden">{ingredient.carbsPerRef}g carbs</span>
                <span className="sm:hidden">{ingredient.fatPerRef}g fat</span>
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
