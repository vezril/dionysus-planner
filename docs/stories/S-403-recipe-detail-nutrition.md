# S-403: Recipe detail with computed nutrition

**Epic:** E-4 Recipes & Nutrition | **Status:** TODO | **Depends on:** S-401, S-103, S-302
**Covers:** FR-17, FR-18, FR-19 (display integration) / NFR-7 (display rounding)

## Context

Recipes can be created (S-401) and the pure nutrition function exists (S-103). This story builds the recipe detail RSC: one joined query, fresh computation via `domain/nutrition`, and the totals + per-serving display with incomplete/unresolved flagging. Read: prd.md FR-17–FR-19, UJ-4; architecture.md §6 Flow B (exact steps: `getWithLinesAndIngredients` → `computeRecipeNutrition` → round at display), ADR-011 (no caching), §5 (`/app/recipes/[id]/page.tsx` is an RSC).

## Acceptance Criteria

1. Given a recipe of ingredients with known nutrition, when its detail page loads, then total calories/protein/carbs/fat display and match hand-calculated values (0.5% pre-rounding tolerance), rounded for display to whole kcal / 0.1 g (FR-17, NFR-7).
2. Given the recipe's servings count, when displayed, then per-serving values = total ÷ servings appear alongside totals; editing servings 4 → 2 (via S-402) doubles per-serving on next view without changing totals (FR-18).
3. Given a recipe line that is unresolved (FR-11) or an ingredient missing an optional field, when displayed, then the affected totals show as "incomplete/N-A" with the offending line(s) identified — NEVER as 0 or a silently wrong number (FR-19 AC).
4. Given an optional field (fiber/sugar/sodium) present on every constituent ingredient, when displayed, then its total/per-serving appear; when absent from any, then the field shows the incomplete marker (FR-17).
5. Given an ingredient override (FR-3) after the recipe was created, when the detail page is next viewed, then the new values are reflected with no cache-invalidation step (ADR-011; completes S-302's deferred assertion).
6. Given a nonexistent recipe id, when visited, then `not-found.tsx` renders (architecture §6).

## Tasks

- [ ] TEST: (integration, `tests/integration/recipe-detail.test.ts`) data assembly — for a fixture recipe, `getWithLinesAndIngredients` + `computeRecipeNutrition` produce the expected totals/per-serving/incomplete flags (wire-level check that the page's inputs are correct; the math itself is S-103's unit-tested surface).
- [ ] IMPL: `app/recipes/[id]/page.tsx` (RSC) — Flow B verbatim: one query, compute fresh, render name/servings/instructions/lines + nutrition panel.
- [ ] TEST: (e2e, `tests/e2e/recipe-nutrition.spec.ts`) UJ-4 — create a 2-ingredient recipe from seeded ingredients, open detail, assert displayed totals equal hand-calculated expected strings (whole kcal, 0.1 g) and per-serving = totals ÷ servings.
- [ ] IMPL: nutrition display panel component (totals + per-serving side by side; mobile-stacked per NFR-8).
- [ ] TEST: (e2e) FR-19 — recipe including one line in cups of a MASS ingredient without density: affected macros show the incomplete marker, not 0, and the unresolved line is visibly flagged ("unresolved — cannot compare units" per FR-11).
- [ ] IMPL: incomplete/unresolved flag rendering (badges on lines + N/A markers on totals).
- [ ] TEST: (e2e) override propagation — override a seeded ingredient's calories (S-302 flow), revisit recipe detail, totals reflect new value (FR-3 AC end-to-end).
- [ ] IMPL: (no code expected — ADR-011 makes this pass by construction; fix only if stale caching sneaks in, e.g., route segment caching must be disabled/dynamic).
- [ ] TEST: (e2e) unknown recipe id renders the not-found boundary.
- [ ] IMPL: `not-found` triggering on missing id in the page loader.

## Dev Notes

- Touches `/app/recipes/[id]/page.tsx`, detail components, tests. NO changes to `/domain/nutrition.ts` (if display needs expose a gap, fix S-103's function via its own unit tests first).
- Beware Next.js caching: this page must render dynamically (fresh compute per view, ADR-011) — ensure the route isn't statically cached (`export const dynamic = 'force-dynamic'` or reliance on DB access opting out; verify with the override-propagation e2e).
- Display rounding uses S-103's formatting helper — do not re-implement rounding in the component (NFR-7 single rounding boundary).
- FR-19 never-show-zero: a legitimate computed 0 (e.g., 0 g fat from fat-free ingredients) is NOT incomplete — the marker comes only from the flags, never from value == 0.
- OUT of scope: recipe list (S-404), cookability display (S-406/S-501), editing (S-402).
