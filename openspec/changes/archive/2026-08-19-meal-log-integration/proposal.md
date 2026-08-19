## Why

`dionysus-service` (a separate Scala/Pekko backend, API-only) now has a working meal-logging domain — sodium-first-class nutrition, recipes, cook events (batches), and eating events (meals) with a per-day rollup. It has no UI by design. `dionysus-planner` is the app Calvin actually opens; it needs a way to log what he eats and see the day's sodium/macro totals without leaving it. This adds a new "Meal Log" section to `dionysus-planner` that talks to `dionysus-service`'s HTTP API.

Scope decision (confirmed): `dionysus-planner`'s own pantry/recipe/ingredient system (Drizzle + SQLite, Cooklang editor, cookability matching) is untouched — it remains a fully separate domain. This is additive, not a migration.

## What Changes

- New `services/dionysusService.ts` — a typed HTTP client for `dionysus-service`'s API (ingredients, recipes, batches, meals, day log). No database access; this module talks only to the external service.
- New `app/lib/dionysusServiceConfig.ts` — resolves `DIONYSUS_SERVICE_URL` once (same pattern as `app/lib/threshold.ts`'s `NEAR_MATCH_DEFAULT_THRESHOLD` resolver).
- New `domain/validation/mealLog.schema.ts` — Zod schemas for the new forms (ingredient, recipe, batch, meal), framework-free, shared by client components and Server Actions.
- New `app/actions/meal-log-actions.ts` — Server Actions wrapping the service client, following the existing `ActionError`/`{ ok, data | error }` contract.
- New `app/meal-log/` section:
  - `app/meal-log/page.tsx` — day view (date-parameterized, defaults to today): day's sodium/macro totals + the meals that contributed, via `GET /api/log/{date}`.
  - `app/meal-log/log/page.tsx` — log a meal: pick one or more lines (a portion of an existing batch, or a directly-loggable ingredient eaten as-is), submit.
  - `app/meal-log/ingredients/page.tsx` — list + create ingredients in `dionysus-service`'s catalog (sodium required, `directlyLoggable` flag).
  - `app/meal-log/recipes/page.tsx` — list + create recipes (ID-referenced ingredient lines, matching the ID-only-matching convention already used elsewhere in this app).
  - `app/meal-log/batches/page.tsx` — list + "cook" (create) a batch from a recipe.
- `components/nav.tsx` — one new entry, "Meal Log", linking to `/meal-log`.
- Docker/Helm: `DIONYSUS_SERVICE_URL` threaded through `Dockerfile`, `docker-compose.yml`, and `charts/dionysus-planner/values.yaml` + `templates/deployment.yaml`, following the existing `NEAR_MATCH_DEFAULT_THRESHOLD` pattern exactly.
- **Dependency**: requires `dionysus-service`'s `GET /api/batches` list endpoint (added this session, PR #5) — without it there'd be no way to list existing batches to log a portion against.

## Capabilities

### New Capabilities
- `meal-log`: the planner-side UI and Server Actions for logging meals against `dionysus-service`, and for managing that service's ingredients/recipes/batches from within `dionysus-planner`.

### Modified Capabilities
(none — `recipe-authoring` and every other existing capability spec is untouched; this is purely additive)

## Impact

- Affected code: new files only, under `services/`, `app/lib/`, `domain/validation/`, `app/actions/`, `app/meal-log/`; one-line addition to `components/nav.tsx`.
- New runtime dependency: `dionysus-service` must be reachable at `DIONYSUS_SERVICE_URL` for the Meal Log section to function. If unreachable, Meal Log pages/actions surface a clear error; the rest of the app (pantry/recipes/what-can-I-cook) is unaffected — no shared failure domain.
- No changes to `data/`, `domain/` (existing files), or the SQLite schema.
- No auth is added on either side — `dionysus-planner` calling `dionysus-service` over a private network is consistent with the service's own no-auth design decision.
