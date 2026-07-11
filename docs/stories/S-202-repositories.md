# S-202: Repositories (data ↔ domain mapping)

**Epic:** E-2 Data layer | **Status:** TODO | **Depends on:** S-201, S-102
**Covers:** FR-9 (canonical + display persistence), FR-5 (search query), FR-24 (ID-keyed reads) / NFR-3 (single-join query shapes)

## Context

Schema and migrations exist (S-201); domain types exist (S-102). This story adds the repository layer — the only mapping between Drizzle rows and `/domain/types.ts` shapes, with the specific query shapes the flows require (single joins, no N+1). Read: architecture.md §5 (`/data/repositories/*` responsibilities), §6 Flow B (recipe+lines+ingredients in ONE query), Flow C (two-query pattern: `pantryRepo.getAllAsIndex()` and `recipeRepo.getAllWithLines()`), §4 (field semantics).

## Acceptance Criteria

1. Given a pantry item saved with displayQuantity 2 / displayUnit "lb", when read back through `pantryRepo`, then `quantityCanonical ≈ 907.184`, `entryUnitClass = MASS`, and the display values return verbatim (FR-9).
2. Given `recipeRepo.getWithLinesAndIngredients(id)`, when called, then it returns the recipe, its lines, and each line's ingredient in a single SQL query (verifiable via query logging/spy), mapped to domain shapes — pure functions never see Drizzle rows (Flow B, architecture §4 intro).
3. Given `pantryRepo.getAllAsIndex()`, when called, then it returns a `Map<ingredientId, {qtyCanonical, class}>` suitable for O(1) matching lookups (Flow C).
4. Given `recipeRepo.getAllWithLines()`, when called with 500 recipes × 5 lines, then it issues one join query (no per-recipe queries) that joins ingredients and projects `{ unitClass, densityGPerMl }` onto each returned line — the density channel `computeCookableAndNearMatch` (S-104) consumes, per architecture §4 as updated (NFR-3, Flow C).
5. Given `ingredientRepo.searchByName("onion")`, when called, then it returns case-insensitive substring matches, and `ingredientRepo` also exposes list-all and get-by-id reads (FR-5 query layer; FR-24: all lookups are ID- or explicit-substring-based, never fuzzy).
6. Given `ingredientRepo.getReferencesTo(ingredientId)`, when called for a referenced ingredient, then it returns the referencing recipes and pantry presence needed for FR-4's friendly blocking message.

## Tasks

- [ ] TEST: (integration, `tests/integration/repositories.test.ts` against `:memory:` + real migrations) ingredientRepo CRUD round-trip: insert custom ingredient → get by id → domain shape equality; searchByName case-insensitive substring; list-all.
- [ ] IMPL: `data/repositories/ingredientRepo.ts` (create, update, getById, listAll, searchByName, getReferencesTo, delete).
- [ ] TEST: (integration) pantryRepo — upsert-friendly primitives (getByIngredientId, insert, updateQuantity, delete), display-value verbatim round-trip (FR-9 AC), getAllAsIndex returns Map keyed by ingredientId with canonical qty + entry class.
- [ ] IMPL: `data/repositories/pantryRepo.ts`.
- [ ] TEST: (integration) recipeRepo — createWithLines (transactional: recipe + lines together), getWithLinesAndIngredients single-query join returning nested domain shape, getAllWithLines returning all recipes with lines in one query with each line carrying the joined ingredient's `unitClass` and `densityGPerMl` (AC-4 shape), updateWithLines replaces lines atomically, delete.
- [ ] IMPL: `data/repositories/recipeRepo.ts` — one join query for detail, one for list (Drizzle relational or manual join + group), transaction for multi-row writes.
- [ ] TEST: (integration) query-count guard — wrap the sqlite connection with a statement counter; assert getAllWithLines and getWithLinesAndIngredients each execute ≤2 statements at 50-recipe fixture scale (anti-N+1, Flow C's explicit risk).
- [ ] IMPL: adjust queries if the counter test fails.

## Dev Notes

- Touches ONLY `/data/repositories/**` and integration tests. Repos return `/domain/types.ts` shapes — mapping happens here and nowhere else (architecture §4 "expressed twice, deliberately").
- Repos are dumb persistence: NO validation, NO increment/replace decision logic (that's the S-304 Server Action), NO nutrition/matching computation.
- Canonical conversion happens in Server Actions via `domain/units.toCanonical` before calling repos — repos store what they're given; the FR-9 round-trip test may call `toCanonical` in the fixture setup.
- OUT of scope: seed runner (S-203), Server Actions (E-3/E-4), route handlers.
