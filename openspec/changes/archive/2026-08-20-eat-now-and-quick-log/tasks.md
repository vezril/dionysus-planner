## 1. Implementation

- [x] 1.1 `cook.schema` += `eatNowPortions` (≥ 0, default 0); `cookRecipe` validates ≤ portions, logs the meal after batch+pantry, soft-fails to a warning; `CookResult` += `eatenNow`/`warnings`
- [x] 1.2 `CookRecipeDialog`: "Eating now" input (default 1, max portions), result line + warning rendering
- [x] 1.3 `quickLogBatchPortion(batchId)` action + `LogPortionButton` on batch rows (≥1 remaining only, inline errors)

## 2. Tests + verification

- [x] 2.1 Integration (mocked service): eat-now meal payload, eat-now 0 no meal, > portions rejected writes nothing, meal-failure → ok + warning with pantry consumed
- [x] 2.2 e2e (cook-recipe.spec, live service): cook with eat-now → day view shows the meal, batch remaining decremented; quick-log button decrements again
- [x] 2.3 Full gate; walkthrough; train v2.11.0
