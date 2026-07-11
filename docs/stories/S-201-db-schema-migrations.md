# S-201: Database connection, schema & migrations

**Epic:** E-2 Data layer | **Status:** DONE (2026-07-11) | **Depends on:** S-101, S-102
**Covers:** FR-6 (unique pantry row constraint), FR-4/FR-15 (FK semantics), FR-13 (servings CHECK) / NFR-5, NFR-6

## Context

Domain types exist (S-102) but there is no persistence. This story creates the SQLite connection module, the full Drizzle schema for all five tables, and the committed initial migration. Repositories come in S-202; boot-time application of migrations comes in S-203. Read: architecture.md §4 (every entity/field/constraint table — the schema is fully specified there), ADR-003 (Drizzle + better-sqlite3, migrate.ts wrapper), §5 (`/data` layout, boundary rule), §7 (WAL pragma, DB_PATH default, dev workflow step 4).

## Acceptance Criteria

1. Given a fresh `:memory:` database, when migrations are applied via `runMigrations(db)` from `data/migrate.ts`, then all tables exist (ingredient, pantry_item, recipe, recipe_line, recipe_tag) with the exact fields/constraints of architecture §4 (NFR-5 groundwork).
2. Given `data/db.ts`, when a connection opens, then `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON` are applied, and the DB path resolves from `DB_PATH` env with dev fallback `./.dev-data/dionysus.db` (directory auto-created, gitignored) (NFR-6, architecture §7).
3. Given a pantry_item for ingredient X, when a second pantry_item for X is inserted directly, then the DB rejects it via the unique constraint on `ingredientId` (FR-6's invariant at the DB level).
4. Given an ingredient referenced by a pantry_item or recipe_line, when deleted directly at the DB level, then the FK `ON DELETE RESTRICT` blocks it; given a recipe with lines, when the recipe row is deleted, then its lines cascade but ingredients and pantry are untouched (FR-4 backstop, FR-15).
5. Given a recipe insert with `servings = 0`, when executed, then the CHECK constraint (servings ≥ 1) rejects it (FR-13 DB backstop).
6. Given the repo, when inspected, then generated SQL migrations are committed under `/drizzle` and `pnpm db:migrate` / `drizzle-kit generate` scripts exist (architecture §7 dev workflow).

## Tasks

- [ ] TEST: (integration, Vitest `tests/integration/schema.test.ts`) applying `runMigrations` on `:memory:` creates all five tables; re-applying is a no-op (migrator journal).
- [ ] IMPL: `data/schema.ts` — all tables per architecture §4: ingredient (seedKey unique nullable, name, unitClass enum, densityGPerMl, 4 required + 3 optional nutrition fields, source enum, overridden bool default false, timestamps); pantry_item (ingredientId FK unique RESTRICT, quantityCanonical, entryUnitClass, displayQuantity, displayUnit, updatedAt); recipe (name, servings int CHECK ≥1, instructions not-null-may-be-empty, timestamps); recipe_line (recipeId FK CASCADE, ingredientId FK RESTRICT, quantityCanonical, entryUnitClass, displayQuantity, displayUnit); recipe_tag (composite PK recipeId+tag, FK CASCADE). Generate the initial migration with drizzle-kit and commit `/drizzle` output.
- [ ] IMPL: `data/migrate.ts` — `runMigrations(db)` wrapping `drizzle-orm/better-sqlite3/migrator` (the ONLY migration call site, per ADR-003).
- [ ] TEST: (integration) `db.ts` connection — WAL journal mode and foreign_keys pragma are active on a temp-file DB; `DB_PATH` unset resolves to `./.dev-data/dionysus.db` and creates the directory.
- [ ] IMPL: `data/db.ts` — better-sqlite3 connection + pragmas + DB_PATH resolution; export a drizzle instance factory usable with `:memory:` for tests.
- [ ] TEST: (integration) constraint suite — duplicate pantry ingredientId rejected; delete of referenced ingredient rejected (both pantry and recipe_line referents); recipe delete cascades lines only; servings=0 rejected; recipe_tag composite PK rejects duplicate (recipeId, tag).
- [ ] IMPL: fix any constraint gaps the tests expose (constraints belong in `schema.ts`, regenerating the migration).
- [ ] Add `pnpm db:migrate` and `pnpm drizzle-kit generate` scripts + `.dev-data/` to `.gitignore` — verified by: scripts run against a scratch DB_PATH.

## Dev Notes

- Touches ONLY `/data/db.ts`, `/data/migrate.ts`, `/data/schema.ts`, `/drizzle/**`, package scripts, and integration tests. Only `/data/**` may import drizzle/better-sqlite3 (S-101 ESLint rule enforces).
- The unique constraint on `pantry_item.ingredientId` IS the FR-6 invariant — do not rely on app logic alone (architecture §4).
- `overridden` defaults false and is only meaningful for SEEDED rows (FR-4/FR-28 tracking); `source` never changes after insert.
- Timestamps are audit-only — no logic may depend on them (architecture §4).
- OUT of scope: repositories/row-mapping (S-202), seed runner and boot hook (S-203), any Server Action.
