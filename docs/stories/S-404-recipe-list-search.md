# S-404: Recipe list & name search

**Epic:** E-4 Recipes & Nutrition | **Status:** TODO | **Depends on:** S-401
**Covers:** FR-25, FR-29 (recipes empty state)

## Context

Recipes can be created (S-401). This story replaces the `/recipes` placeholder with the real list: server-rendered full list with client-side name search, plus the recipes empty state. Sort, cookability filter, and calorie annotations come in S-406; tags in S-405. Read: prd.md FR-25, FR-29; architecture.md §6 Flow D (server-rendered list, client-side search over the loaded list — no per-keystroke round-trip), §5 (`/app/recipes/page.tsx`).

## Acceptance Criteria

1. Given existing recipes, when `/recipes` loads, then all recipes render server-side (no pagination at NFR-3 scale) with name and servings, each linking to its detail page (Flow D).
2. Given the search input, when the user types a substring, then the visible list filters client-side, case-insensitive, within 300 ms at NFR-3 scale (FR-25 AC — trivially met by in-memory filtering per Flow D).
3. Given zero recipes, when `/recipes` loads, then the FR-29 empty state renders with a "create your first recipe" CTA linking to `/recipes/new` — never blank or an error.
4. Given a 375px viewport, when the list renders, then it is usable with no horizontal scroll (NFR-8).

## Tasks

- [ ] TEST: (e2e, `tests/e2e/recipes.spec.ts`) empty state — fresh app: `/recipes` shows empty-state message + CTA to `/recipes/new` (FR-29).
- [ ] IMPL: `app/recipes/page.tsx` (RSC) — `recipeRepo.getAllWithLines()` full render; empty-state branch.
- [ ] TEST: (unit, Vitest `tests/unit/domain/listFilters.test.ts`) pure substring-filter predicate in `domain/listFilters.ts` (framework-free) — case-insensitive substring match over plain items ("chick" matches "Chicken Stir-Fry" and "Chickpea Soup", not "Pasta"); empty query matches all; whitespace-only query treated as empty.
- [ ] IMPL: `matchesNameSearch(item, query)` predicate in `domain/listFilters.ts`.
- [ ] TEST: (e2e) search — with 3+ fixture recipes ("Chicken Stir-Fry", "Chickpea Soup", "Pasta"), typing "chick" filters to the two matches case-insensitively; clearing restores all (wiring check over the unit-tested predicate).
- [ ] IMPL: client `RecipeSearchInput` filtering the already-rendered list via the `listFilters` predicate (client component wrapping the list items or filtering a serialized prop — no API round-trip per Flow D).
- [ ] TEST: (e2e, mobile project) list at 375px — rows readable, no horizontal scroll.
- [ ] IMPL: responsive list layout (cards on mobile, table/rows on desktop).

## Dev Notes

- Touches `/app/recipes/page.tsx` + list components, `domain/listFilters.ts` (pure, framework-free filter helpers — this story creates the module; S-405/S-406 extend it), tests. No new actions/repos.
- Flow D architecture note: search/sort/filter all operate CLIENT-SIDE over the server-loaded list. This story establishes that client-list component structure — build it so S-405 (tag filter) and S-406 (sort + status filter + annotations) extend the same component rather than re-architecting.
- Do not add the nutrition/cookability annotations yet — S-406 owns the annotated Flow D scan; this story's page may fetch recipes only (cheaper) and S-406 upgrades the loader.
- OUT of scope: sort (FR-27), cookability filter (FR-26), calories/serving column, tags (FR-16).
