# Proposal: meal-micronutrients

## Why

dionysus-service now rolls micronutrients through recipes, meals, and
day logs (service change micronutrient-rollup, live on :dev). The
planner tracks per-ingredient micronutrients since v2.9.0 but drops them
at the service boundary: cook mirrors omit them, and the Meals day view
can't show "vitamin D today: 25 µg".

## What Changes

1. **Cook mirror carries micronutrients.** `mirrorNutritionPerCanonicalUnit`
   gains the sparse map (amount ÷ reference, like the macros); the cook
   action loads each mirrored ingredient's rows and sends them on
   ingredient creation. Reused mirrors are NOT retro-updated (same
   reuse-by-name simplification as the rest of the mirror).
2. **Day view shows micronutrient totals.** The Meals day page renders a
   Micronutrients block from `totalNutrition.micronutrients` when
   non-empty, labeled via the domain registry (unknown keys fall back to
   the raw key).
3. TS service types gain the additive `micronutrients` fields.

## Impact

- `domain/cooking.ts`, `app/actions/cook-actions.ts`,
  `services/dionysusService.ts`, `app/meal-log/page.tsx`, tests. No
  storage changes, no schema changes.
