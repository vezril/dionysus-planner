# Dionysus Planner — Epics & Story Index

**Status:** DRAFT for readiness gate (2026-07-11)
**Sources:** prd.md (APPROVED v2), architecture.md (APPROVED v3). Story files live in `docs/stories/S-<epic><nn>-<slug>.md`; each is self-contained for implementation in a fresh context alongside the PRD and architecture doc.

Coverage contract: all MUST FRs (FR-1..4, 6..11, 13..15, 17..22, 24, 25, 28, 29) and all SHOULD FRs (FR-5, 12 [confirmed in v1], 16, 23, 26, 27) are covered below, plus the cross-cutting NFR work (Docker: NFR-1/4/5/9; seed data asset: FR-1/A-5). A traceability table is at the end.

---

## E-1 Foundation — scaffold + pure domain layer

**Goal:** Stand up the locked toolchain (Next.js 15 / pnpm / TS / Tailwind / shadcn / Vitest / Playwright / ESLint boundaries) and build the framework-free domain core — units/conversion, nutrition, matching — that every feature consumes. This is the primary TDD surface (ADR-007).

| ID | Title | One-line scope | Covers |
|---|---|---|---|
| S-101 | Project scaffold & toolchain | Repo skeleton, configs, test toolchain, ESLint boundary rules per architecture §5 | A-6 / NFR-4, NFR-8, NFR-10 (tooling) |
| S-102 | Domain units & conversion engine | `UNITS` table, `toCanonical`, `resolveQuantityForComparison` (density + UNRESOLVED sentinel) | FR-9, FR-10, FR-11, FR-12 / NFR-7 |
| S-103 | Domain nutrition computation | `computeRecipeNutrition`: totals, per-serving, incomplete flags, display rounding helper | FR-17, FR-18, FR-19 / NFR-7 |
| S-104 | Domain matching & ranking | `computeCookableAndNearMatch`: cookable classification, near-match ranking, shortfalls, threshold | FR-20, FR-21, FR-22, FR-24 / NFR-3 |
| S-105 | App shell, nav & error boundaries | Layout, nav, root redirect, error/not-found boundaries, placeholder empty states | FR-29 (groundwork) / NFR-2, NFR-8 |

## E-2 Data layer — schema, repositories, seed

**Goal:** The single-SQLite-file persistence layer: schema with DB-enforced invariants, repositories mapping rows to domain shapes with anti-N+1 query shapes, and the idempotent migrate-then-seed boot flow — plus the curated seed content itself.

| ID | Title | One-line scope | Covers |
|---|---|---|---|
| S-201 | DB connection, schema & migrations | db.ts (WAL/FK pragmas, DB_PATH), full Drizzle schema + constraints, committed migrations | FR-6/4/15/13 (constraints) / NFR-5, NFR-6 |
| S-202 | Repositories | ingredient/pantry/recipe repos, single-join query shapes, domain mapping | FR-9, FR-5 (query), FR-24 / NFR-3 |
| S-203 | Seed runner, boot hook & health | Idempotent override-preserving seed, `instrumentation.ts` migrate-then-seed, `/api/health` | FR-28, FR-1 (mechanism) / NFR-1, NFR-9 |
| S-204 | Seed data content (~300 ingredients) | Curated USDA-transcribed JSON + densities for staples + provenance file — **content workstream, fully parallelizable** | FR-1 / A-5, NFR-9 |

## E-3 Ingredients & Pantry — UI + actions

**Goal:** The ingredient catalog (browse/search/create/override/delete-with-rules) and the quantity-tracked pantry (add-with-upsert incl. the human-confirmed increment rule, edit, remove).

| ID | Title | One-line scope | Covers |
|---|---|---|---|
| S-301 | Ingredient catalog view & search | RSC catalog list + client search box + `/api/ingredients?q=` (reused by all pickers) | FR-1 (display), FR-5 |
| S-302 | Ingredient create & override | Zod schema, create + edit/override forms and actions, `overridden` flag transition | FR-2, FR-3 |
| S-303 | Ingredient deletion rules | Delete action with referencing-records listing; seeded never deletable | FR-4 |
| S-304 | Pantry view & add (upsert) | Pantry list, add flow, one-row-per-ingredient upsert, increment/replace incl. cross-class rejection | FR-6, FR-9, FR-29 (pantry) / FR-11, FR-12 |
| S-305 | Pantry edit & remove | Pre-filled quantity/unit edit; item removal | FR-7, FR-8 |

## E-4 Recipes & Nutrition display

**Goal:** Recipe authoring (create/edit/delete, tags) and the read side: detail page with fresh-computed nutrition and flagged incompleteness, plus the annotated list with search/sort/filter.

| ID | Title | One-line scope | Covers |
|---|---|---|---|
| S-401 | Recipe creation | Zod schema, multi-line editor, `createRecipe` with canonical+display line persistence | FR-13 |
| S-402 | Recipe edit & delete | Pre-filled editor, replace-set line updates, delete with cascade | FR-14, FR-15 |
| S-403 | Recipe detail with nutrition | Flow B: one query + fresh compute; totals/per-serving; incomplete/unresolved flags | FR-17, FR-18, FR-19 (display) / NFR-7 |
| S-404 | Recipe list & name search | RSC full list, client-side substring search, recipes empty state | FR-25, FR-29 (recipes) |
| S-405 | Recipe tags & tag filtering | Free-text tags in editor, tag filter on list (SHOULD, cuttable) | FR-16 |
| S-406 | List annotations, sort & status filter | Flow D full scan: calories/serving + cookability badges, sort, cookability filter (SHOULD, cuttable) | FR-26, FR-27 |

## E-5 What Can I Cook

**Goal:** The app's front door: Cookable Now + ranked Near Match with exact per-line shortfalls, adjustable threshold, and the cross-cutting acceptance layer (journeys, first-run, scale).

| ID | Title | One-line scope | Covers |
|---|---|---|---|
| S-501 | What Can I Cook view | Flow C RSC: cookable list, ranked near-match with shortfalls, summarized tail, first-run states | FR-20, FR-21, FR-22, FR-24 (UI), FR-29 |
| S-502 | Adjustable near-match threshold | Slider + `/api/what-can-i-cook?threshold=` route (SHOULD, cuttable) | FR-23 |
| S-503 | E2E journeys, first-run & scale | UJ-1..5 journey suites, FR-29 sweep, 375px pass, NFR-3 load fixture | FR-29 / NFR-2, NFR-3, NFR-8, NFR-10 |

## E-6 Packaging

**Goal:** Ship it: the multi-stage Docker image, reference compose file, and a scripted smoke test acting as the release gate (no separate CI epic).

| ID | Title | One-line scope | Covers |
|---|---|---|---|
| S-601 | Docker packaging, compose & smoke test | Dockerfile per §7, compose, smoke script: health ≤10 s, durability/re-seed, offline, ≤500 MB | FR-28, FR-1 (container) / NFR-1, NFR-4, NFR-5, NFR-9 |

---

## Implementation sequence (dependency-ordered)

Stories on the same numbered step have no dependency on each other and **can run in parallel**. S-204 (seed content) is a pure content workstream — it can start at step 1 and land any time before S-503's full-catalog assertions.

1. **S-101** — project scaffold (everything depends on it)
2. **S-102**, **S-105**, **S-201**, **S-204** — in parallel (domain units; app shell; DB schema; seed content)
3. **S-103**, **S-104**, **S-202** — in parallel (nutrition + matching need S-102; repos need S-201+S-102)
4. **S-203** — seed runner + boot + health (needs S-201, S-202)
5. **S-301**, **S-601** — in parallel (catalog UI needs shell+repos+seed; Docker needs the boot flow — Docker can also slide later without blocking anything)
6. **S-302**, **S-304**, **S-401** — in parallel (all need S-301's picker API; independent of each other)
7. **S-303**, **S-305**, **S-402**, **S-403**, **S-404** — in parallel (each extends exactly one step-6 story; S-403 also needs S-103 and S-302)
8. **S-405**, **S-501** — in parallel (tags need list; WCIC needs matching+pantry+recipes; S-501 creates the `resolveDefaultThreshold()` helper)
9. **S-406**, **S-502** — in parallel (both consume S-501's `resolveDefaultThreshold()` helper; annotations also need list+domain)
10. **S-503** — cross-cutting acceptance (needs everything user-facing; then re-run S-601's smoke as the final gate — this post-S-204 re-run is where the FR-1 "seeded count ≥ 300" full-catalog assertion is checked, on top of S-601's own "count == bundled seed-data.json length" check)

Critical path: S-101 → S-102 → S-202 (via S-201) → S-203 → S-301 → S-401 → S-501 → S-502 → S-503.

## Traceability (requirement → stories)

| Requirement | Stories |
|---|---|
| FR-1 | S-203, S-204, S-301, S-601 |
| FR-2 | S-302 |
| FR-3 | S-302 (+ propagation verified in S-403) |
| FR-4 | S-201 (constraints), S-303 |
| FR-5 | S-202 (query), S-301 |
| FR-6 | S-201 (unique constraint), S-304 |
| FR-7 / FR-8 | S-305 |
| FR-9 | S-102, S-202, S-304 |
| FR-10 / FR-11 / FR-12 | S-102 (+ FR-11/12 exercised in S-103, S-104, S-304) |
| FR-13 | S-401 (+ S-201 CHECK) |
| FR-14 / FR-15 | S-402 |
| FR-16 | S-405 |
| FR-17 / FR-18 / FR-19 | S-103 (math), S-403 (display) |
| FR-20 / FR-21 / FR-22 | S-104 (engine), S-501 (UI) |
| FR-23 | S-502 |
| FR-24 | S-104, S-202, S-501 |
| FR-25 | S-404 |
| FR-26 / FR-27 | S-406 |
| FR-28 | S-203, S-601 |
| FR-29 | S-105 (groundwork), S-304, S-404, S-501, S-503 (sweep) |
| NFR-1 | S-203, S-601 |
| NFR-2 | S-105, S-503 |
| NFR-3 | S-104, S-202, S-503 |
| NFR-4 | S-101 (standalone config), S-601 |
| NFR-5 | S-201, S-601 |
| NFR-6 | S-201 |
| NFR-7 | S-102, S-103, S-403 |
| NFR-8 | S-101 (tooling), S-105, per-view stories, S-503 (sweep) |
| NFR-9 | S-203, S-204, S-601 |
| NFR-10 | S-101 (Playwright engines), S-503 |

## Notes for the readiness gate

- **SHOULD-tier stories** (S-405, S-406, S-502; FR-5 search UI inside S-301) are marked cuttable in their files; no MUST story depends on any of them.
- **OQ-4 (reference hardware)** remains open: S-503 and S-601 record CI-machine timings as smoke-level evidence, not final NFR sign-off.
- **S-204 is the schedule risk** (architecture Risk #4): ~300 curated USDA transcriptions. It is parallelizable from day one and only hard-blocks S-503's full-catalog assertions and the step-10 final smoke's FR-1 ≥300 check (S-203 develops against a sample file; S-601 asserts count == bundled file length and deliberately does NOT depend on S-204).
- **Ordering-sensitive details** encoded in stories, not left to implementer memory: FR-11 UNRESOLVED-never-zero (S-102/S-103/S-104), the human-confirmed cross-class increment rejection (S-304), the `overridden` flag transition (S-302) that FR-28 (S-203) depends on, and the migrate-before-seed boot order (S-203).
