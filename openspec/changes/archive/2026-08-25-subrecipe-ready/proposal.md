# Sub-recipe links show ready batches

## Why
A [[sub-recipe]] link always reads as "go make this" — but when the
sub-recipe was already cooked and portions sit in Inventory, the parent
should say "use what's available" instead.

## What Changes
- getRecipeDetail computes availability for every referenced sub-recipe
  (service batches summed per recipe, matched by mirror name — the same
  mapping the planner's ready-to-eat uses; empty when the service is
  down).
- The detail page renders "N portions ready" (status-cookable) on the
  sub-recipe link when portions remain, so the reader reaches for the
  batch instead of cooking again.

## Impact
data/recipes.ts (+ parser reuse), detail page, integration tests,
service-gated e2e, train v2.39.0.
