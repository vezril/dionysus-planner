# S-406: Recipe list annotations, sort & cookability filter

**Epic:** E-4 Recipes & Nutrition | **Status:** DONE (2026-07-11) | **Depends on:** S-404, S-103, S-104, S-501
**Covers:** FR-26 (SHOULD), FR-27 (SHOULD)

## Context

The recipe list with search exists (S-404); the pure nutrition (S-103) and matching (S-104) functions exist. This story upgrades the list to architecture Flow D in full: the page runs the same two-query scan as Flow C once per request, annotates every recipe server-side with calories/serving and cookability status, then adds client-side sorting and a cookability filter. Read: architecture.md §6 Flow D (the exact mechanism), Flow C (the scan), ADR-011; prd.md FR-26, FR-27.

## Acceptance Criteria

1. Given the recipe list, when it renders, then each recipe shows a cookability badge (Cookable Now / Near Match / Missing More) computed server-side from the current pantry via `computeCookableAndNearMatch`, and calories per serving via `computeRecipeNutrition` (Flow D), with nutrition-incomplete recipes showing an incomplete marker rather than a number (FR-19 consistency).
2. Given the sort control, when the user selects name, servings, or calories-per-serving (asc/desc), then the list reorders accordingly, client-side (FR-27 AC); recipes with incomplete calories sort to the end under calorie sort (deterministic rule).
3. Given the status filter, when "Cookable Now" (or All / Near Match / Missing More) is selected, then only that subset shows, consistent with FR-20's classification at filter time (FR-26 AC).
4. Given search (FR-25), tags (FR-16, if present), sort, and status filter together, when combined, then all constraints compose without a server round-trip (Flow D client-side operation).

## Tasks

- [ ] TEST: (integration, `tests/integration/recipe-list-data.test.ts`) list annotation assembly — fixture pantry + recipes: each recipe annotated with correct status (cookable / near-match / missing-more per S-104 output and the active default threshold) and calories/serving (or incomplete flag) — the wiring, not the math (S-103/S-104 own the math).
- [ ] IMPL: server-side loader for `/app/recipes/page.tsx` running `pantryRepo.getAllAsIndex()` + `recipeRepo.getAllWithLines()` + both domain functions, producing an annotated, serializable list-item shape (Flow D).
- [ ] TEST: (unit, Vitest `tests/unit/domain/listFilters.test.ts`) pure sort comparator + status predicate in `domain/listFilters.ts` (framework-free) — tri-key comparator (name / servings / calories-per-serving, asc + desc) over plain annotated items; incomplete-calorie items always sort last under calorie sort regardless of direction; status predicate maps each item's annotation to All / Cookable Now / Near Match / Missing More membership.
- [ ] IMPL: `sortRecipes(items, key, direction)` comparator and `matchesStatus(item, status)` predicate in `domain/listFilters.ts`.
- [ ] TEST: (e2e, `tests/e2e/recipe-list-controls.spec.ts`) sort — fixtures with distinct names/servings/calories: each sort key asc/desc reorders correctly; incomplete-calorie recipe lands last on calorie sort (wiring check over the unit-tested comparator).
- [ ] IMPL: sort control (client, shadcn Select) extending S-404's client list component, delegating ordering to the `listFilters` comparator.
- [ ] TEST: (e2e) status filter — fixture pantry making one recipe cookable, one near-match, one missing-more: each filter option shows exactly its subset; "All" restores; composes with a search term.
- [ ] IMPL: status filter control + cookability badges, delegating membership to the `listFilters` status predicate.

## Dev Notes

- Touches `/app/recipes/page.tsx` loader + list client components, `domain/listFilters.ts` (pure, framework-free helpers only), tests. NO changes to `/domain/matching.ts` or `/domain/nutrition.ts` — if the annotation needs data those functions don't return, extend them via their own unit-tested stories' surfaces first.
- Status classification uses the app-layer default threshold (env `NEAR_MATCH_DEFAULT_THRESHOLD` → 3) to draw the Near Match / Missing More boundary — reuse S-501's `resolveDefaultThreshold()` helper (S-501 owns and creates it; this story depends on S-501 and must not define a second resolver).
- Per ADR-011 nothing is cached: the annotated scan runs fresh per request (~tens of ms at NFR-3 scale per Flow D's argument) — do not memoize across requests.
- Both FRs are SHOULD-tier: cuttable without breaking the core loop; keep the S-404 list functional if this story is dropped.
- OUT of scope: the What Can I Cook page itself (S-501), threshold UI (S-502), tag filter (S-405).
