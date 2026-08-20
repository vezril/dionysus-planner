## 1. Implementation

- [x] 1.1 `services/dionysusService.ts`: `NutritionJson`/`IngredientJson` gain `micronutrients` (additive)
- [x] 1.2 `mirrorNutritionPerCanonicalUnit` includes the ÷REF micronutrient map; cook action fetches rows on mirror creation and sends them
- [x] 1.3 Meals day view renders the Micronutrients block (registry labels, raw-key fallback, empty → nothing)

## 2. Tests + verification

- [x] 2.1 Unit: mirror micros math (÷100 mass/volume, ÷1 count, empty passthrough)
- [x] 2.2 Integration: cook mirror payload includes micronutrients; reused mirror skips the fetch
- [x] 2.3 Full gate (lint, tsc, unit, integration, chromium e2e; cook e2e against live :dev container)
- [x] 2.4 Walkthrough + deploy train (v2.10.0)
