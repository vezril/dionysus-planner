# S-104: Domain matching & near-match ranking

**Epic:** E-1 Foundation | **Status:** TODO | **Depends on:** S-102
**Covers:** FR-20, FR-21, FR-22, FR-24 / NFR-3 (algorithmic shape)

## Context

The unit engine (S-102) exists. This story adds `computeCookableAndNearMatch(pantryIndex, recipes, threshold)` in `/domain/matching.ts` — the pure Cookable Now / Near Match classifier and ranker. The UI that renders it comes later (S-501/S-502). Read: prd.md FR-20–FR-24 and Glossary (Cookable Now, Near-Match, Unsatisfied line, Shortfall); architecture.md §4 "Matching algorithm's home" and "Open-question defaults encoded" (OQ-1 threshold as explicit parameter, OQ-3 equal weighting), §6 Flow C (data shapes: `Map<ingredientId, {qtyCanonical, class}>` pantry index; O(lines) scan). Density channel (architecture §4, updated): each recipe line object carries its ingredient's `unitClass` and `densityGPerMl`, projected by `recipeRepo.getAllWithLines()`'s ingredient join (S-202) — density reaches this function via the line objects; there is NO extra density parameter. Fixtures must use that line shape.

## Acceptance Criteria

1. Given a pantry index and recipes, when classified, then a recipe is Cookable Now iff for EVERY ingredient ID it references, the pantry quantity (canonical) ≥ the recipe's TOTAL required canonical quantity for that ID, with duplicate lines for the same ingredient summed before comparison (FR-20).
2. Given a recipe line whose unit class cannot be resolved against the pantry entry's class (per FR-11/FR-12 via `resolveQuantityForComparison`), when classified, then that line counts as unsatisfied — never guessed (FR-11, FR-20).
3. Given pantry item "onion" and a recipe line for "yellow onion" as distinct catalog IDs, when classified, then they do not match — matching is by ingredient ID equality only (FR-24).
4. Given non-cookable recipes, when ranked, then ordering is ascending by unsatisfied-line count, ties broken by ascending mean shortfall proportion (fully-missing or unresolved line = 1.0), then alphabetically by recipe name (FR-21).
5. Given `threshold` (default 3 supplied by the caller), when ranked, then recipes with unsatisfied-line count > threshold are excluded from the near-match list (but reported in a "missing more" count); a recipe missing exactly 3 lines is included, 4 is excluded (FR-21).
6. Given an unsatisfied line with partial quantity present in a comparable class, when reported, then the result carries the shortfall (required − available) expressed in the recipe line's display unit (FR-22 — "need 200 g more rice" for 300 g required / 100 g held).
7. Given two recipes each missing one line, when one is 20% short and the other fully missing, then the 20%-short recipe ranks first (FR-21 AC).
8. Given a recipe with two unsatisfied lines referencing the SAME ingredient ID, when ranked, then the requirements aggregate per ingredient ID into ONE unsatisfied entry (unsatisfied-line count = 1 for FR-21), with the shortfall computed on the aggregate requirement (summed required − available) and displayed in the first such line's display unit.

## Tasks

- [ ] TEST: (unit, `tests/unit/domain/matching.test.ts`) cookable classification — fixture pantry + recipes: all-satisfied recipe is cookable; one-line-short recipe is not; recipe with the same ingredient on two lines requires the SUM of both (FR-20 AC).
- [ ] IMPL: core classification loop — for each recipe, aggregate required canonical quantities per ingredient ID, `Map.get` pantry entry, `resolveQuantityForComparison` using the line-carried ingredient `unitClass`/`densityGPerMl` (pantry entry class → line/ingredient comparison per architecture §4), compare.
- [ ] TEST: (unit) FR-24 — two distinct ingredient IDs with similar names never match; a matching ID with sufficient quantity does.
- [ ] IMPL: (should hold by construction — ID-keyed Map only; add no name-based fallback.)
- [ ] TEST: (unit) unresolved handling — pantry in g, line in cups, no density → line unsatisfied with shortfall proportion 1.0; with density set → resolves and satisfies when quantity suffices (FR-11/FR-12 within matching).
- [ ] IMPL: unresolved → unsatisfied wiring.
- [ ] TEST: (unit) shortfall values — 300 g required, 100 g held → shortfall 200 in unit "g"; shortfall proportion 200/300; fully missing → full required quantity, proportion 1.0 (FR-22, Glossary).
- [ ] IMPL: per-line shortfall computation, converting shortfall back to the recipe line's display unit for reporting.
- [ ] TEST: (unit) duplicate-ingredient attribution — recipe with 2 short lines of the same ingredient (e.g., 200 g + 100 g rice) and pantry holding 100 g: exactly ONE unsatisfied entry (count = 1 for FR-21 ranking), shortfall = 200 displayed in the first line's display unit; with pantry ≥ 300 g the recipe is cookable (AC-8).
- [ ] IMPL: per-ingredient aggregation of unsatisfied entries with aggregate shortfall reported in the first line's display unit.
- [ ] TEST: (unit) ranking — fixtures covering: 1-missing above 2-missing; tie on count broken by mean shortfall proportion (0.2 above 1.0); tie on both broken alphabetically; threshold 3 includes 3-missing, excludes 4-missing; excluded tail returned as a count (FR-21 AC + architecture Flow C render note).
- [ ] IMPL: ranking comparator + threshold filter, isolated in one comparator function (architecture OQ-3 note: weighting change must be a localized edit).

## Dev Notes

- Touches ONLY `/domain/matching.ts` and its unit tests. Pure function over plain fixtures — zero DB/Next imports (architecture §5, ADR-007).
- `threshold` is an explicit parameter; the domain layer NEVER reads `process.env` (architecture §4 OQ-1 note — the app layer resolves `NEAR_MATCH_DEFAULT_THRESHOLD` in S-501's `resolveDefaultThreshold()` helper).
- OQ-3 is encoded as-proposed: missing and insufficient both count as 1 unsatisfied line; proportion is tiebreak only. Keep this logic inside the comparator.
- Return shape per architecture §4: `{ cookable: Recipe[], nearMatch: RankedRecipe[] }` — extend with the missing-more count and per-line shortfall details needed by FR-22/Flow C's render rules; keep it a plain serializable object.
- Complexity must stay O(total lines) with O(1) pantry lookups (Flow C's NFR-3 argument) — no per-line scans of the pantry array.
- OUT of scope: the What Can I Cook page (S-501), threshold UI/env default (S-502), recipe-list cookability badges (S-406).
