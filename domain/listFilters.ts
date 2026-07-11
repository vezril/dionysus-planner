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
