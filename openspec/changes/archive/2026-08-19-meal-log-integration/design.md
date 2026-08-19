## Context

`dionysus-planner` is a Next.js App Router app with one domain today: pantry/recipes/ingredients backed by Drizzle + SQLite, with a strict `domain/` (framework-free) vs `data/` (only place allowed to import `drizzle-orm`/`better-sqlite3`) boundary enforced by ESLint. `dionysus-service` is a separate Scala/Pekko HTTP API with its *own*, differently-shaped ingredient/recipe model (sodium required, no free-text Cooklang body — recipes are a flat list of `{ingredientId, quantity, unit}` lines) plus batches and meals, which `dionysus-planner` has never talked to before.

This change adds a new feature area that calls an *external* HTTP API instead of the local database — a pattern this codebase doesn't have yet. The existing `domain/`/`data/` split doesn't quite fit: an HTTP client has no DB dependency (so the ESLint rule doesn't restrict it either way), but it's also not "pure business logic" in the `domain/` sense — it's an I/O boundary, just not a database one.

## Goals / Non-Goals

**Goals:**
- Let Calvin log a meal and see the day's sodium/macro totals from inside `dionysus-planner`.
- Give the Meal Log section enough CRUD (ingredients, recipes, batches) to actually be usable against a `dionysus-service` instance that starts empty — without it, there's nothing to log against.
- Keep this fully additive: zero changes to the existing pantry/recipe/ingredient domain, its data, or its tests.

**Non-Goals:**
- No migration or unification of `dionysus-planner`'s own ingredient/recipe IDs with `dionysus-service`'s — these are two separate ID spaces, two separate catalogs, and the UI must never conflate them (a `dionysus-service` ingredient picker in the Meal Log section is entirely distinct from the existing recipe editor's `@mention` picker over `dionysus-planner`'s own catalog).
- No offline/retry queue for when `dionysus-service` is unreachable — a clear error is enough for a personal homelab setup where both apps are typically up together.
- No auth between the two apps — matches `dionysus-service`'s own phase-1 decision; both are assumed to run on the same private network.

## Decisions

**1. A new top-level `services/` directory holds the HTTP client (`services/dionysusService.ts`), sibling to `domain/` and `data/`.**
Alternatives considered:
- *Put it in `data/`* — rejected: `data/` is specifically "the only place allowed to import drizzle/better-sqlite3" per the ESLint rule; putting a non-DB HTTP client there would blur that boundary's meaning even though it wouldn't technically violate the rule (nothing stops a non-DB file living there, but it invites confusion about what `data/` means).
- *Put it in `domain/`* — rejected: `domain/` must stay framework-free/pure (no `fetch` side effects intended, per its existing "no react/next imports" ESLint rule, and conceptually it's meant to be pure business logic, not I/O).
`services/` names the thing for what it is: a client for an external service, parallel in spirit to `data/`'s role for the internal database.

**2. `app/lib/dionysusServiceConfig.ts` resolves `DIONYSUS_SERVICE_URL` once, lazily, at call time — mirroring `app/lib/threshold.ts` exactly.**
Same reasoning as the existing pattern: `domain/` and `services/` never read `process.env` directly; only this one "app layer" resolver does, and callers (Server Actions) pass the resolved base URL down. Keeps `services/dionysusService.ts` testable without env-var gymnastics (tests just pass a base URL directly).

**3. Server Actions (`app/actions/meal-log-actions.ts`) wrap `services/dionysusService.ts`, following the existing `ActionError { code, message, fieldErrors? }` / `{ ok, data | error }` contract exactly.**
New `error.code` value: `SERVICE_ERROR` (a `fetch` failure, non-2xx response, or unreachable host) — the direct analog of the existing `PERSISTENCE_ERROR` for DB failures, just for an HTTP dependency instead of a database one. `VALIDATION_ERROR` continues to mean "the shared Zod schema rejected the input" — actions still re-validate with the schema before calling the service client, same as every other action in this app (ADR-005).

**4. Pages fetch via Server Components calling the service client directly (same pattern as existing pages calling `data/*.ts` facades), `export const dynamic = "force-dynamic"`.**
Day totals and batch remaining-portions are live, frequently-changing values — the existing pages that need fresh data already use this pattern (e.g. the recipe list), so no new caching strategy is introduced.

**5. Recipe/batch/meal forms use plain repeatable-row inputs (ingredient dropdown + quantity + unit), not the Cooklang `@mention` editor.**
`dionysus-service`'s `Recipe` has no free-text body to author — it's already a flat structured list of `{ingredientId, quantity, unit}` lines, which is exactly what a simple repeatable-row form maps onto directly. Introducing mention-style free text here would require *inventing* a text format this API doesn't have, for no benefit. (This mirrors what `dionysus-planner`'s own recipe form looked like *before* the Cooklang migration — which is fine; it's the right shape for a flat list, not a step backward.)

**6. Meal-line authoring: a line is either "portion of an existing batch" or "a directly-loggable ingredient" — a two-mode picker matching `dionysus-service`'s `MealLine` sum type 1:1.**
The batch picker lists `GET /api/batches`, showing each batch's recipe (resolved client-side by cross-referencing the recipes list already fetched for the page) and remaining portions; the ingredient picker lists `GET /api/ingredients` filtered client-side to `directlyLoggable: true`.

**7. Testing: integration tests mock `services/dionysusService.ts` (or the underlying `fetch`) rather than spinning up a temp SQLite DB — there is no DB in this feature's path.**
Keeps the existing "pinned contract" doc-comment style for Server Action tests, just swapping the fixture: a mocked HTTP client instead of `mkdtempSync` + `runMigrations`.

**8. `DIONYSUS_SERVICE_URL` is threaded through `Dockerfile`, `docker-compose.yml`, and the Helm chart's `values.yaml`/`deployment.yaml`, following the `NEAR_MATCH_DEFAULT_THRESHOLD` template exactly — no default baked in (it's required for this feature to function, unlike the threshold which has a sane default).**
The Helm chart does not deploy `dionysus-service` alongside `dionysus-planner` (they're separate charts/releases) — the operator supplies the URL as a values override pointing at wherever `dionysus-service` is actually running (in-cluster Service DNS name, or an external host).

## Risks / Trade-offs

- **[Risk] Two separate "ingredient" concepts (planner's own, and `dionysus-service`'s) in the same app could confuse the user.** → **Mitigation:** the Meal Log section's UI copy and page titles are explicit ("Meal Log Ingredients" or similarly scoped labels, not bare "Ingredients") to avoid implying they're the same catalog as the existing `/ingredients` page.
- **[Risk] `dionysus-service` being down breaks the entire Meal Log section.** → **Mitigation:** acceptable for a personal homelab setup (both apps deployed together); Server Actions surface a clear `SERVICE_ERROR`, and this failure mode is isolated to `/meal-log/*` routes — the rest of the app keeps working.
- **[Risk] Building CRUD for ingredients/recipes/batches in `dionysus-planner` duplicates form-building work already done once in `dionysus-service`'s own domain (conceptually, not code) and again here.** → **Mitigation:** accepted as necessary — without it there's no way to populate `dionysus-service` from a UI at all; the forms here are intentionally simpler (flat rows, no Cooklang) than `dionysus-planner`'s own recipe editor, so the duplication is small.

## Migration Plan

Greenfield — purely additive. No existing data, routes, or tests change. Rollback is deleting the new files and the one `nav.tsx` line; nothing else depends on this feature existing.

## Open Questions

- None blocking. Whether to eventually surface `dionysus-service` catalog data through `dionysus-planner`'s *existing* ingredient/recipe UI (true unification) instead of a parallel Meal Log section is a much larger future decision, explicitly out of scope here (see proposal.md's scope decision).
