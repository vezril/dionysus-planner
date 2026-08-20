# Design: meal-micronutrients

## D1 — Mirror math stays in one helper

`mirrorNutritionPerCanonicalUnit(ingredient, micronutrients)` returns the
existing five fields plus `micronutrients: Record<string, number>` with
every amount ÷ REFERENCE_QUANTITY_BY_CLASS (per-1-canonical-unit, the
service's line semantics). The cook action fetches each mirrored
ingredient's rows (`getIngredientMicronutrients`) only when creating a
missing service mirror — reuse-by-name skips the fetch entirely.

## D2 — Day view rendering

`/meal-log` (Meals day view) renders a "Micronutrients" list under the
day totals when `totalNutrition.micronutrients` has keys: registry label
+ amount (1 decimal) + registry unit; keys missing from the registry
render as the raw key with no unit (forward-compatible with a renamed
registry). Absent/empty map renders nothing — days without micronutrient
data look exactly as before.

## D3 — Types are additive

`NutritionJson.micronutrients` is required in the TS type (the service
always writes it) but read defensively (`?? {}`) so a stale service
without the field cannot crash the page.
