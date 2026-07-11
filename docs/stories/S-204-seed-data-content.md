# S-204: Seed data content — ~300 curated ingredients

**Epic:** E-2 Data layer | **Status:** DONE (2026-07-11) | **Depends on:** none (JSON schema contract from architecture §8; can start immediately, in parallel with all app code)
**Covers:** FR-1 / A-5, NFR-9 (bundled data), Success Criterion #1

## Context

This is the content-authoring workstream (architecture Risk #4) — deliberately decoupled from app code by the fixed JSON schema in architecture §8 and explicitly parallelizable from day one. It produces the checked-in `data/seed/seed-data.json`: ~300+ common home-cooking ingredients with nutrition values transcribed from USDA FoodData Central, plus densities for cross-measured staples. Read: architecture.md §8 (row schema, seedKey convention `usda:<fdcid>`, licensing/provenance note), §4 Ingredient fields; prd.md FR-1, A-5, OQ-5, Success Criterion #1.

## Acceptance Criteria

1. Given a fresh install, when the seed (S-203) applies this file, then ≥300 ingredients appear in the catalog, each with name, unitClass, and at minimum calories/protein/carbs/fat per reference basis (FR-1).
2. Given the file, when validated, then every row conforms to the §8 schema: unique `seedKey` (`usda:<FDC id>` form), `unitClass` ∈ {MASS, VOLUME, COUNT}, required nutrition fields numeric ≥ 0 and expressed per 100 g / 100 mL / 1 each according to unitClass, optional fields numeric-or-null, `densityGPerMl` numeric-or-null.
3. Given common cross-measured staples (at minimum: all-purpose flour, granulated sugar, brown sugar, white rice, rolled oats, olive oil, vegetable oil, butter, milk, water, honey, salt), when inspected, then each has a plausible `densityGPerMl` set so FR-12 conversion works for them out of the box.
4. Given a spot-check of 20 sampled rows against their USDA FoodData Central source records, when compared, then ≥95% match within rounding (Success Criterion #1 counter-check).
5. Given `SEED_DATA_SOURCES.md`, when read, then it lists each row's originating FDC ID / provenance and the curation criteria used (architecture §8 licensing note, OQ-5 auditability).
6. Given the curated set, when reviewed for coverage, then it spans the categories a home cook needs (produce, meats, fish, dairy/eggs, grains/pasta/bread, legumes, nuts/seeds, oils/fats, herbs/spices, condiments/sauces, baking staples, canned/frozen basics) sufficient for the PRD's 10-reference-recipe test (Success Criterion #1).

## Tasks

- [ ] TEST: (unit, `tests/unit/seed-data.test.ts`) schema-validation spec over `seed-data.json` — Zod (or equivalent) schema asserting AC-2's structural rules, ≥300 rows, unique seedKeys, and AC-3's named staples having non-null density. Written first against the sample file (will fail on row count until content lands — that IS the red state).
- [ ] IMPL: curate the ingredient LIST (~300 names + categories) per the coverage matrix in AC-6; record curation criteria in `SEED_DATA_SOURCES.md`.
- [ ] IMPL: transcribe nutrition values from USDA FoodData Central per ingredient (calories, protein, carbs, fat; fiber/sugar/sodium where available), per-100g for MASS, per-100mL for VOLUME, per-1-each for COUNT items (eggs, tortillas, etc.); assign `seedKey = usda:<fdcId>`; record each FDC ID in `SEED_DATA_SOURCES.md`.
- [ ] IMPL: add densities (g/mL) for the AC-3 staple list plus any other commonly volume-measured dry/liquid goods, from FDC portion data or standard references; note the density source per row in `SEED_DATA_SOURCES.md`.
- [ ] IMPL: replace `data/seed/seed-data.json` with the full file; keep `seed-data.sample.json` for fast tests.
- [ ] TEST: (integration) run the S-203 seed against the FULL file on `:memory:` — completes in bounded time (<1 s target per Risk #6) and yields ≥300 rows.
- [ ] Manual verification: sample 20 rows at random, compare against FDC source values, record the check result in `SEED_DATA_SOURCES.md` (AC-4).

## Dev Notes

- Touches ONLY `data/seed/seed-data.json`, `data/seed/seed-data.sample.json` (kept), `SEED_DATA_SOURCES.md`, and its validation tests. No app code.
- PARALLELIZABLE: can run alongside any other story from the very first sprint; only S-203's tests consume the file, and they use the sample until this lands (architecture Risk #4 mitigation).
- USDA FDC data is public domain; the provenance file is for auditability, not legal necessity (architecture §8).
- Values are transcribed at build/curation time — NO runtime or build-time network fetching may be introduced (NFR-9, NG-6). If tooling/scripts are used to help transcription, they are one-off and not part of the app build.
- Watch the reference-basis trap: FDC reports per 100 g even for liquids — VOLUME-class rows must be converted to per-100 mL using the density before entry; COUNT-class rows need a sensible per-each basis (document the assumed unit weight in the provenance file).
- OUT of scope: seed runner logic (S-203), any UI.
