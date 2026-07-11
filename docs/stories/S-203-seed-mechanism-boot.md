# S-203: Idempotent seed runner, boot hook & health endpoint

**Epic:** E-2 Data layer | **Status:** TODO | **Depends on:** S-201, S-202
**Covers:** FR-28, FR-1 (mechanism half) / NFR-1, NFR-9

## Context

Schema, migrations, and repositories exist (S-201/S-202). This story adds the migrate-then-seed boot flow: the idempotent, override-preserving seed runner, the root `instrumentation.ts` hook, and `/api/health` gated on seed completion. It is developed against a small committed SAMPLE seed file; the full ~300-ingredient asset arrives independently via S-204 (same JSON schema contract). Read: architecture.md §6 Flow A (the exact algorithm and ordering — this story implements it verbatim), §8 (seed data strategy, JSON row schema), Risk #6 (health gated on seed-complete signal); prd.md FR-28, FR-1, NFR-1, NFR-9.

## Acceptance Criteria

1. Given a fresh empty database, when the seed runs, then every row of `data/seed/seed-data.json` is inserted with `source='SEEDED'`, `overridden=false`, keyed by unique `seedKey`, inside a single transaction (FR-1 mechanism, Flow A).
2. Given a database already seeded, when the seed re-runs (container restart simulation), then the ingredient count is unchanged — no duplicates (FR-28).
3. Given a seeded ingredient the user has overridden (`overridden=true`), when the seed re-runs with different values for that seedKey, then the user's values are preserved untouched (FR-28, FR-3).
4. Given a seeded, non-overridden ingredient, when the seed re-runs with corrected nutrition values for its seedKey, then the row updates to the new values (Flow A "seed corrections flow through").
5. Given server boot (dev or production), when `instrumentation.ts#register()` runs, then it applies migrations FIRST, then seeds, both idempotent, entirely inside the `NEXT_RUNTIME === 'nodejs'` guard with dynamic import of the data layer (Flow A ordering + Edge-bundle guard).
6. Given `/api/health`, when seeding has not yet completed on a fresh boot, then it does not report healthy; when migrate+seed have committed, then it returns 200 (NFR-1, Risk #6) — on the nodejs runtime.
7. Given no outbound network access, when boot completes, then seeding worked entirely from the local JSON file (NFR-9).

## Tasks

- [ ] Create `data/seed/seed-data.sample.json` (5–10 rows in the §8 schema) used by tests, and wire `data/seed/seed-data.json` as the production path (starts as a copy of the sample until S-204 lands) — verified by: JSON parses and satisfies the seed row schema.
- [ ] TEST: (integration, `tests/integration/seed.test.ts` against `:memory:`) fresh seed inserts all rows with source/overridden defaults; unique seedKey respected.
- [ ] IMPL: `data/seed/seed.ts` — Flow A algorithm: per row, select by seedKey → insert if absent; update nutrition fields if present and `overridden=false`; skip if `overridden=true`; single transaction.
- [ ] TEST: (integration) re-run idempotency — run seed twice, count unchanged (FR-28 AC).
- [ ] TEST: (integration) override preservation — seed, set overridden=true + edited calories on one row, re-seed with changed source values → user values intact; sibling non-overridden row DOES take updated values.
- [ ] IMPL: (refine seed.ts until the above pass.)
- [ ] TEST: (integration) seed-complete signal — health check predicate (e.g., meta table flag or seeded-row-count ≥ seed-file length) is false before seed, true after (Risk #6).
- [ ] IMPL: seed-complete signal + `app/api/health/route.ts` (GET, `runtime = 'nodejs'`, checks DB connection open + seed-complete; returns 200/503).
- [ ] TEST: (integration) boot orchestration function (`bootstrap()` in `/data` or called from instrumentation) — on an empty temp-file DB performs migrate then seed; calling it twice is safe (dev hot-reload re-invocation, Flow A).
- [ ] IMPL: root `instrumentation.ts` — `register()` with `NEXT_RUNTIME === 'nodejs'` guard and dynamic `import()` of the data layer; calls only `/data` entry points (`runMigrations`, seed) per the §5 boundary rule.
- [ ] Add `pnpm db:seed` script — verified by: running it against a scratch DB_PATH seeds and is re-runnable.
- [ ] TEST: (e2e smoke) `next start` boot → GET `/api/health` returns 200 and `/ingredients` placeholder can read ≥1 seeded row (proves the hook fires in a real server).

## Dev Notes

- Touches `/data/seed/**`, root `instrumentation.ts`, `/app/api/health/route.ts`, package scripts, tests. `instrumentation.ts` must live at PROJECT ROOT — Next.js recognizes no other location (architecture §5/Flow A).
- The seed join key is `seedKey`, never `name` or DB `id` (a rename must not break idempotency — architecture §8).
- Never mark healthy before the seed transaction commits (NFR-1 race, Risk #6). Health route stays on the Node runtime — `better-sqlite3` cannot run on Edge (ADR-004).
- Seed only touches nutrition/density fields on update — never `name` (user may have renamed), never `source`/`overridden`.
- OUT of scope: the full 300-ingredient content (S-204 — schema contract only here), ingredient UI, Docker HEALTHCHECK wiring (S-601).
