# S-103: Domain nutrition computation

**Epic:** E-1 Foundation | **Status:** DONE (2026-07-11) | **Depends on:** S-102
**Covers:** FR-17, FR-18, FR-19 / NFR-7

## Context

The unit engine (S-102) exists. This story adds the pure function `computeRecipeNutrition(recipe, ingredientsById)` in `/domain/nutrition.ts` that turns a recipe's lines plus ingredient profiles into totals, per-serving values, and incomplete flags. No UI or DB — display wiring happens in S-403. Read: prd.md FR-17–FR-19, NFR-7, A-1; architecture.md §4 (nutrition fields per reference basis, `REFERENCE_QUANTITY_BY_CLASS`), §6 Flow B (exact computation steps and rounding boundary), ADR-011 (no caching).

## Acceptance Criteria

1. Given a recipe with 2 ingredients of known nutrition values and same-class units, when totals are computed, then calories/protein/carbs/fat match a hand calculation within 0.5% pre-rounding (FR-17, NFR-7).
2. Given a recipe line in a unit class other than the ingredient's primary class with density set, when computed, then the line's quantity is density-converted to the ingredient's reference basis and contributes correct nutrition within 5% (FR-12 path of FR-17).
3. Given a recipe line that resolves to `'UNRESOLVED'` (FR-11), when computed, then that line contributes to NO totals and every affected total is flagged incomplete — the flagged value is never rendered as 0 (FR-19).
4. Given an ingredient missing an optional field (e.g., fat data absent — note fat is required per FR-2, so the realistic case is fiber/sugar/sodium), when computed, then that optional total is flagged incomplete/N-A rather than summed as if 0; an optional field appears as a completed total only when present on every constituent ingredient (FR-17, FR-19).
5. Given totals and a servings count, when per-serving values are computed, then per-serving = total ÷ servings; changing servings 4 → 2 doubles per-serving values without altering totals (FR-18).
6. Given the function's return value, when inspected, then it carries full-precision numbers; rounding (0.1 g macros, whole kcal) exists only in a separate display-formatting helper applied at the return/display boundary (NFR-7).

## Tasks

- [ ] TEST: (unit, `tests/unit/domain/nutrition.test.ts`) hand-calculated fixture — 2 ingredients (e.g., 200 g chicken @ known per-100g + 150 g rice @ known per-100g); assert each macro total within 0.5% pre-rounding, exact expected values written out in the test as comments (FR-17 AC; architecture Risk #3 makes this test the summation-refactor guard).
- [ ] IMPL: `computeRecipeNutrition(recipe, ingredientsById)` skeleton — per line: `resolveQuantityForComparison` against the ingredient's primary class, scale nutrition fields by resolvedQty / referenceQuantity, sum in float64.
- [ ] TEST: (unit) per-serving math — totals ÷ servings; servings 4→2 doubles per-serving, totals unchanged (FR-18 AC).
- [ ] IMPL: per-serving computation in the same return shape (`{ totals, perServing, servings }`).
- [ ] TEST: (unit) unresolved line — one line COUNT vs MASS, no density: all required macro totals flagged `incomplete: true`, unresolved line identified in the result, no zero-contribution (FR-19 AC).
- [ ] IMPL: incomplete-flag propagation for unresolved lines.
- [ ] TEST: (unit) optional-field semantics — recipe of 2 ingredients where only one has fiber: fiber total flagged incomplete/absent; where both have fiber: fiber total computed (FR-17's "present on every constituent ingredient").
- [ ] IMPL: optional-field (fiber/sugar/sodium) presence logic.
- [ ] TEST: (unit) density path — volume-entered line on a MASS-primary ingredient with density: correct contribution within 5% of hand calc (FR-12).
- [ ] IMPL: (should already pass via S-102's resolver — if not, fix wiring, not the resolver).
- [ ] TEST: (unit) display rounding helper — 12.34999 g → "12.3 g", 456.7 kcal → "457 kcal"; helper is separate from computation (NFR-7).
- [ ] IMPL: `formatNutritionForDisplay()` (or equivalent) rounding helper in `/domain/nutrition.ts`.

## Dev Notes

- Touches ONLY `/domain/nutrition.ts` and its unit tests. Pure functions over plain objects; no DB rows, no React (architecture §5 boundary + ADR-007).
- FR-19 never-show-zero is the critical edge: an incomplete total must be structurally distinguishable (flag/absent) from a computed 0 — a recipe of only zero-calorie ingredients legitimately totals 0 and is NOT incomplete.
- Reference basis comes from the ingredient's PRIMARY `unitClass` via `REFERENCE_QUANTITY_BY_CLASS` (100 g / 100 mL / 1 each) — never from the line's entry class (architecture §4).
- Do not cache or persist computed results (ADR-011 — computed fresh on every view).
- OUT of scope: recipe detail page/UI (S-403), repositories (S-202), matching (S-104).
