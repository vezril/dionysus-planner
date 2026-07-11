/**
 * List-filtering predicates (architecture.md §6 Flow D — search/sort/filter
 * all operate CLIENT-SIDE over the server-loaded list). Pure,
 * framework-free — no imports from next/*, react, drizzle-orm, or
 * better-sqlite3 (ESLint-enforced, see eslint.config.mjs).
 *
 * S-404 creates this module with `filterByNameSubstring`; S-405/S-406 are
 * expected to extend it with tag/sort/status filters rather than
 * re-implementing matching elsewhere (docs/stories/S-404-recipe-list-search.md
 * Dev Notes).
 */

/**
 * Case-insensitive substring match of `item.name` against `query`, applied
 * over `items` and returning a NEW array (never mutating `items` or its
 * elements). An empty or whitespace-only `query` (after trimming) returns
 * ALL items, in their original order — never treated as "matches nothing".
 * A `query` that matches nothing returns `[]`, never `undefined`/`null`.
 *
 * Generic over any item shape carrying at least a `name: string` field
 * (recipe rows, ingredient rows, etc.) — not recipe-specific.
 */
export function filterByNameSubstring<T extends { name: string }>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...items];
  }
  return items.filter((item) => item.name.toLowerCase().includes(needle));
}

/**
 * S-405 (docs/stories/S-405-recipe-tags.md AC2, FR-16) — pure tag-AND
 * intersection predicate. An item matches iff its `tags` array contains
 * EVERY string in `selectedTags` (extra tags beyond the selection never
 * disqualify); an empty `selectedTags` matches every item, in original
 * order, mirroring `filterByNameSubstring`'s empty-query rule. Matching is
 * EXACT, case-sensitive string equality — tags are free text that this app
 * deliberately never lowercase-folds (Dev Notes: "do not lowercase-fold
 * silently; store as typed").
 *
 * Generic over any item shape carrying at least a `tags: string[]` field
 * (recipe summaries/detail rows) — not recipe-specific, same "extend this
 * module" pattern `filterByNameSubstring` established for S-404. Pure:
 * never mutates `items`, any item, or any item's `tags` array; returns a
 * NEW array.
 */
export function filterByTagsAll<T extends { tags: string[] }>(items: T[], selectedTags: string[]): T[] {
  if (selectedTags.length === 0) {
    return [...items];
  }
  return items.filter((item) => selectedTags.every((tag) => item.tags.includes(tag)));
}

export type RecipeSortKey = "name" | "servings" | "caloriesPerServing";
export type SortDirection = "asc" | "desc";
export type CookabilityStatusFilter = "ALL" | "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE";

/**
 * S-406 (docs/stories/S-406-recipe-list-sort-filter.md AC2, FR-27) — pure
 * tri-key comparator over server-annotated list items. Orders by `key`
 * (`"name"` case-insensitive, `"servings"`/`"caloriesPerServing"` numeric) in
 * `direction`. Under `"caloriesPerServing"`, any item whose value is `null`
 * (nutrition-incomplete, FR-19) sorts to the very END, in EITHER direction —
 * the readiness-gate's deterministic rule. Ties (equal `servings`/
 * `caloriesPerServing`, or multiple trailing `null` items) break by `name`
 * ascending (case-insensitive), regardless of the requested direction.
 *
 * Generic over any item shape carrying at least `name`, `servings`, and
 * `caloriesPerServing` (`data/recipes.ts`'s `AnnotatedRecipeSummary`) — this
 * comparator itself takes no dependency on that module. Pure: never mutates
 * `items`; returns a NEW array.
 */
export function sortRecipes<T extends { name: string; servings: number; caloriesPerServing: number | null }>(
  items: T[],
  key: RecipeSortKey,
  direction: SortDirection,
): T[] {
  const directionFactor = direction === "asc" ? 1 : -1;
  const byNameAscending = (a: T, b: T) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

  return [...items].sort((a, b) => {
    if (key === "name") {
      return directionFactor * byNameAscending(a, b);
    }

    if (key === "servings") {
      if (a.servings !== b.servings) {
        return directionFactor * (a.servings - b.servings);
      }
      return byNameAscending(a, b);
    }

    // key === "caloriesPerServing"
    const aIncomplete = a.caloriesPerServing === null;
    const bIncomplete = b.caloriesPerServing === null;
    if (aIncomplete && bIncomplete) {
      return byNameAscending(a, b);
    }
    if (aIncomplete) {
      return 1;
    }
    if (bIncomplete) {
      return -1;
    }
    if (a.caloriesPerServing !== b.caloriesPerServing) {
      return directionFactor * (a.caloriesPerServing! - b.caloriesPerServing!);
    }
    return byNameAscending(a, b);
  });
}

/**
 * S-406 (docs/stories/S-406-recipe-list-sort-filter.md AC3, FR-26) — a
 * single-item predicate mapping an already-annotated item's `cookability`
 * field to membership in a selected status filter. `"ALL"` matches every
 * item, regardless of `cookability` (mirrors `filterByNameSubstring`'s/
 * `filterByTagsAll`'s own "empty selection matches everything" convention).
 * Any other status matches iff `item.cookability` is EXACTLY that value.
 * Does not reclassify anything itself — that's
 * `domain/matching.ts#computeCookableAndNearMatch`'s job. Pure: never
 * mutates `item`.
 */
export function matchesStatus<T extends { cookability: "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE" }>(
  item: T,
  status: CookabilityStatusFilter,
): boolean {
  if (status === "ALL") {
    return true;
  }
  return item.cookability === status;
}
