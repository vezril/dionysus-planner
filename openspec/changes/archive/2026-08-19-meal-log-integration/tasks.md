## 1. Service client, config, and schemas

- [x] 1.1 `app/lib/dionysusServiceConfig.ts` — resolves `DIONYSUS_SERVICE_URL` lazily, mirroring `app/lib/threshold.ts`
- [x] 1.2 `services/dionysusService.ts` — typed HTTP client: `listIngredients`, `createIngredient`, `listRecipes`, `createRecipe`, `listBatches`, `createBatch`, `createMeal`, `getDayLog(date)`; every function takes `baseUrl` as a parameter (no `process.env` read inside `services/`)
- [x] 1.3 `domain/validation/mealLog.schema.ts` — Zod schemas: `ingredientSchema`, `recipeSchema` (name/servings/lines), `batchSchema` (recipeId/servingsMade/cookedAt), `mealSchema` (eatenAt/lines, each line a batch-portion or direct-consumable variant)
- [x] 1.4 Unit tests for the schemas (`tests/unit/domain/mealLog-schema.test.ts`) — mirrors `recipe-schema.test.ts`'s style

## 2. Server Actions

- [x] 2.1 `app/actions/meal-log-actions.ts` — `createMealLogIngredient`, `createMealLogRecipe`, `createMealLogBatch`, `logMeal`; each re-validates with the shared schema, calls `services/dionysusService.ts`, maps HTTP/network failures to `{ ok: false, error: { code: "SERVICE_ERROR", message } }`
- [x] 2.2 Integration tests (`tests/integration/meal-log-actions.test.ts`) — mock `services/dionysusService.ts`; cover validation-error, service-error, and success paths for each action, following the existing "pinned contract" doc-comment style

## 3. Day view and meal logging pages

- [x] 3.1 `app/meal-log/page.tsx` — day view, `?date=` searchParam (default today), calls `getDayLog`, `force-dynamic`; zeroed-totals empty state
- [x] 3.2 `app/meal-log/log/page.tsx` + `app/meal-log/log/_components/LogMealForm.tsx` — two-mode line picker (batch-portion / direct-consumable), submits via `logMeal`, surfaces over-portioning/not-directly-loggable rejections from the server
- [x] 3.3 e2e: consolidated into `tests/e2e/meal-log-flow.spec.ts` (scope reduction, recorded here per this task's own escape hatch) — one serial spec covering create-ingredient → create-recipe → cook-batch → log-meal → day-view, rather than one file per page; gated `test.skip` on `DIONYSUS_SERVICE_URL` being set

## 4. Ingredient, recipe, and batch management pages

- [x] 4.1 `app/meal-log/ingredients/page.tsx` + `_components/MealLogIngredientForm.tsx` — list + create, sodium required, `directlyLoggable` checkbox; page/heading copy explicitly distinguishes this from `dionysus-planner`'s own `/ingredients`
- [x] 4.2 `app/meal-log/recipes/page.tsx` + `_components/MealLogRecipeForm.tsx` — list + create, repeatable ingredient-line rows (dropdown sourced from the Meal Log ingredient list, by ID) — not the Cooklang editor
- [x] 4.3 `app/meal-log/batches/page.tsx` + `_components/CookBatchForm.tsx` — list (with remaining portions) + create (pick recipe, set servingsMade/cookedAt)
- [x] 4.4 e2e: covered by the same consolidated `tests/e2e/meal-log-flow.spec.ts` (scope reduction — see 3.3)

## 5. Navigation and error isolation

- [x] 5.1 `components/nav.tsx` — add the "Meal Log" entry
- [x] 5.2 Verified manually and live: killed the `dionysus-service` connection, confirmed `/meal-log` renders the `error.tsx` boundary while `/recipes` continued working normally; restored the connection afterward. Not additionally covered by an isolated-server e2e spec (would require its own dedicated Playwright server project per `playwright.config.ts`'s existing `isolated-chromium` pattern) — scope reduction, recorded here.

## 6. Docker, Helm, and CI wiring

- [x] 6.1 `Dockerfile` — no baked-in default for `DIONYSUS_SERVICE_URL` (required var, unlike the threshold's default)
- [x] 6.2 `docker-compose.yml` — `DIONYSUS_SERVICE_URL` entry pointing at a local `dionysus-service` instance for local dev
- [x] 6.3 `charts/dionysus-planner/values.yaml` + `templates/deployment.yaml` — `env.dionysusServiceUrl` values field threaded into the container env
- [x] 6.4 Decision: added a new non-required `e2e-meal-log` CI job (same "not a required status check" precedent as `helm-lint`) that pulls `calvinference/dionysus:dev` from Docker Hub, waits for `/health`, and runs `tests/e2e/meal-log-flow.spec.ts` against it. The required `checks`/`e2e`/`docker-smoke` jobs are untouched — the new spec is inert there since `DIONYSUS_SERVICE_URL` is never set in that job.

## 7. Verification

- [x] 7.1 `pnpm lint`, `npx tsc --noEmit`, `pnpm test:unit` (296 passing), `pnpm test:integration` (212 passing) all green; also spot-checked `tests/e2e/shell.spec.ts` on chromium (nav change doesn't break the existing 4-section contract)
- [x] 7.2 `pnpm test:e2e` — confirmed the new spec is a no-op (`4 skipped`) without `DIONYSUS_SERVICE_URL`, so the existing required suite is unaffected; ran green (`4 passed`) with `DIONYSUS_SERVICE_URL` pointed at the live homelab service
- [x] 7.3 Manual walkthrough against the live homelab `dionysus-service`, done via the browser tool (not just curl): created an ingredient, created a recipe, cooked a batch, logged a meal, viewed the day log — sodium math verified correct at every step (74mg/unit × 300 / 2 servings = 11100mg, then confirmed again at the day-log total). Test data cleaned up afterward via the API (recipe has no delete endpoint on dionysus-service by original design, so "Chicken Salad" remains — harmless, noted for the record).
