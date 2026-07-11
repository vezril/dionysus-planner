# S-501: What Can I Cook view

**Epic:** E-5 What Can I Cook | **Status:** TODO | **Depends on:** S-104, S-304, S-401
**Covers:** FR-20, FR-21, FR-22, FR-24 (UI integration), FR-29 (first-run state)

## Context

The matching engine (S-104), pantry (S-304), and recipes (S-401) exist; `/what-can-i-cook` is still the S-105 placeholder. This story builds the app's front door: the RSC that runs the two-query scan, invokes `computeCookableAndNearMatch`, and renders the Cookable Now list, the ranked Near Match list with per-line shortfalls, and the summarized missing-more tail. Read: prd.md FR-20–FR-22, FR-24, FR-29, UJ-3; architecture.md §6 Flow C (data fetch, compute, render rules — including "tail summarized by count, not rendered"), §4 OQ-1 note (threshold default resolution in the app layer). Density channel (architecture §4, updated): `recipeRepo.getAllWithLines()` (S-202) returns lines carrying the joined ingredient's `unitClass` and `densityGPerMl`, which is exactly the shape `computeCookableAndNearMatch` (S-104) consumes — this page just passes it through; no extra density fetch or parameter.

## Acceptance Criteria

1. Given a pantry and recipes, when `/what-can-i-cook` loads, then recipes fully satisfied by the pantry (per FR-20's summed-canonical comparison) appear under "Cookable Now", and hand-verifying each ingredient line for a fixture pair confirms membership (FR-20 AC).
2. Given non-cookable recipes within the default threshold (3, resolved from `NEAR_MATCH_DEFAULT_THRESHOLD` env → fallback 3), when rendered, then they appear under "Near Match" in FR-21's exact order (unsatisfied count asc → mean shortfall proportion asc → name), and recipes exceeding the threshold are not rendered but summarized by count (FR-21, Flow C render rule).
3. Given a near-match recipe, when its entry renders, then each unsatisfied line is listed: fully missing lines named, partial lines with shortfall in the recipe's unit ("need 200 g more rice" for 300 g required / 100 g held), unresolved lines flagged as "unresolved — cannot compare units" (FR-22, FR-11).
4. Given pantry item "onion" and a recipe line "yellow onion" (distinct IDs), when classified, then no match occurs (FR-24 AC end-to-end).
5. Given a fresh install (no recipes and/or no pantry items), when the view loads, then a defined empty state with CTAs (add pantry items / create a recipe) renders — never an error or blank page (FR-29 AC).
6. Given a pantry edit that takes a requirement below threshold (e.g., reduce rice to 50 g), when the view reloads, then the affected recipe drops out of Cookable Now immediately (FR-20 AC's depletion clause; fresh compute per ADR-011).
7. Given a 375px viewport, when the view renders, then both lists are usable with no horizontal scroll (NFR-8).

## Tasks

- [ ] TEST: (integration, `tests/integration/wcic-data.test.ts`) page data assembly — seeded fixture pantry + recipes through `pantryRepo.getAllAsIndex` + `recipeRepo.getAllWithLines` + `computeCookableAndNearMatch(…, threshold)`: cookable membership, near-match order, shortfall payloads, missing-more count all correct at the wiring level; threshold argument comes from the env-resolution helper (env set → used; unset → 3).
- [ ] IMPL: `app/what-can-i-cook/page.tsx` (RSC) — Flow C verbatim: two repo calls (line shape per AC/Context: lines carry ingredient `unitClass`/`densityGPerMl`), one domain call, render; plus the shared `resolveDefaultThreshold()` app-layer helper, which THIS story owns and creates (consumed later by S-406 and S-502).
- [ ] TEST: (e2e, `tests/e2e/what-can-i-cook.spec.ts`) UJ-3 fixture — pantry + 3 recipes (one fully covered, one missing 200 g rice of 300 g, one missing 4 ingredients): cookable recipe under "Cookable Now"; near-match shows "need 200 g more rice"-style shortfall; 4-missing recipe not listed but counted in the summarized tail.
- [ ] IMPL: Cookable Now + Near Match list components with per-line shortfall rendering and unresolved-line flag.
- [ ] TEST: (e2e) FR-24 — create "onion" and "yellow onion" as distinct ingredients, pantry has "onion", recipe needs "yellow onion": recipe is NOT cookable and lists the line as missing.
- [ ] IMPL: (no code expected — ID-only matching is S-104's construction; fix wiring only.)
- [ ] TEST: (e2e) first-run empty state — fresh DB (seed only): empty-state message + CTAs render; no error (FR-29 AC).
- [ ] IMPL: empty-state branch (distinct messages for no-recipes vs no-pantry vs neither).
- [ ] TEST: (e2e) depletion — reduce a pantry quantity via the pantry UI, reload WCIC, recipe moved from Cookable to Near Match with the correct shortfall.
- [ ] IMPL: ensure dynamic rendering (no stale route cache — same concern as S-403).
- [ ] TEST: (e2e, mobile project) 375px usability.
- [ ] IMPL: responsive list layout.

## Dev Notes

- Touches `/app/what-can-i-cook/page.tsx` + components, the shared threshold-resolution helper (app layer), tests. NO changes to `/domain/matching.ts` (extend via S-104's unit tests if the render needs more data).
- Flow C's render rule is load-bearing for NFR-2: never render the missing-more tail as list items — count only.
- The domain layer never reads `process.env` — threshold resolution lives here in the app layer (architecture §4 OQ-1 note).
- Root `/` already redirects here (S-105) — keep it working; this page replaces the placeholder.
- OUT of scope: the threshold slider + API route (S-502), recipe-list badges (S-406).
