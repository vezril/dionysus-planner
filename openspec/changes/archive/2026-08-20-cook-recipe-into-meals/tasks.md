## 1. Domain

- [x] 1.1 `domain/cooking.ts`: pure helpers — `planCookConsumption(lines, pantryRows, factor)` → per-line `{status: ok|insufficient|missing|unresolved, requiredInPantryBasis}` (uses resolveQuantityForComparison incl. package bridge); `mirrorNutritionPerCanonicalUnit(ingredient)` (perRef ÷ REF, null sodium → 0)
- [x] 1.2 Unit tests: each status, factor scaling, floor-at-zero shortfall math, per-canonical-unit mirror values

## 2. Data

- [x] 2.1 `data/pantry` facade: `consumeFromPantry(decrements)` — one transaction, floors at zero, returns applied amounts + shortfalls
- [x] 2.2 Integration tests: decrement, floor, multi-row atomicity

## 3. Service mirroring + actions

- [x] 3.1 `app/actions/cook-actions.ts`: `previewCook(recipeId, portions)` (statuses + pantry list for substitutes) and `cookRecipe(input)` (zod schema; server re-derivation; ensure ingredient mirrors by name → ensure recipe mirror by name → createBatch → pantry tx; SERVICE_ERROR consumes nothing)
- [x] 3.2 Integration tests with a mocked service module: happy path decrements + batch payloads, second-cook reuse (no duplicate creates), ignore/substitute paths, service-failure leaves pantry untouched, "consume" on a missing line rejected

## 4. UI

- [x] 4.1 `CookRecipeDialog` on `/recipes/[id]` wired to the slider's portion count: preview rows w/ status badges, Ignore/Substitute controls (pantry select + qty + unit), confirm → success panel linking to `/meal-log/batches`, inline errors
- [x] 4.2 e2e (needs live service, meal-log project): cook 2 portions of a pantry-covered recipe → batch row appears in Meals › Batches, pantry row decremented; missing-ingredient recipe requires a choice before confirm enables

## 5. Verification

- [x] 5.1 Full gate: lint, tsc, unit, integration, chromium e2e (+ e2e-meal-log)
- [x] 5.2 Manual walkthrough against the deployed service
