# S-401: Recipe creation

**Epic:** E-4 Recipes & Nutrition | **Status:** DONE (2026-07-11) | **Depends on:** S-301, S-202
**Covers:** FR-13 / (FR-9 pattern applied to recipe lines)

## Context

Ingredient search (S-301) and repositories (S-202) exist. This story adds recipe authoring: the Zod recipe schema, the multi-line recipe editor (name, servings, instructions, ingredient lines with quantity+unit), and the `createRecipe` Server Action persisting lines with canonical + display values. Read: prd.md FR-13, UJ-2, A-2; architecture.md §4 Recipe/RecipeLine, §5 (`/app/recipes/new/page.tsx` is a client editor), ADR-005, §6 error handling.

## Acceptance Criteria

1. Given the New Recipe editor, when the user enters name, servings (integer ≥1), instructions (free text, may be empty), and ≥1 ingredient line (ingredient via catalog search + quantity + unit), then the recipe saves and appears in the recipe list (FR-13).
2. Given a recipe with 0 ingredient lines, when save is attempted, then it is blocked with a validation message, client-side and server-side (FR-13 AC, ADR-005).
3. Given servings of 0, a negative/fractional servings, a line with no ingredient, or a non-positive line quantity, when submitted, then inline validation errors block the save (FR-13, architecture §4 CHECK).
4. Given a saved recipe, when its lines are read back, then each line stores `quantityCanonical` + `entryUnitClass` computed via `toCanonical` AND the verbatim `displayQuantity`/`displayUnit` (architecture §4 RecipeLine — same pattern as pantry, FR-9).
5. Given a line entered in a unit class other than the ingredient's primary class, when saved, then it saves successfully (permissive entry — FR-11/FR-12 govern computation later, not save-time validation).

## Tasks

- [ ] TEST: (unit, `tests/unit/domain/recipe-schema.test.ts`) `domain/validation/recipe.schema.ts` — name required; servings integer ≥1 (0, -1, 2.5 all fail); instructions optional-empty; lines array min length 1; each line: ingredientId required, quantity positive, unit ∈ UNITS.
- [ ] IMPL: `recipe.schema.ts` (Zod).
- [ ] TEST: (integration, `tests/integration/recipe-actions.test.ts`) `createRecipe` — valid input creates recipe + lines transactionally with canonical AND display values persisted per line; 0-line payload returns field error and writes nothing; invalid servings rejected; cross-class line (e.g., cups of a MASS ingredient) saves fine.
- [ ] IMPL: `app/actions/recipe-actions.ts#createRecipe` — Zod parse, per-line `toCanonical`, `recipeRepo.createWithLines`, revalidate recipe list path.
- [ ] TEST: (e2e, `tests/e2e/recipes.spec.ts`) UJ-2 authoring flow — open New Recipe, add two lines via ingredient search combobox, attempt save with no lines first (blocked with message), then save valid recipe; it appears in the recipe list and its detail URL loads.
- [ ] IMPL: `app/recipes/new/page.tsx` client editor — react-hook-form field array for lines, ingredient combobox reusing `/api/ingredients?q=`, unit select (FR-10 set), servings/instructions inputs.
- [ ] TEST: (e2e, mobile project) recipe editor usable at 375px (NFR-8) — line rows wrap/stack, no horizontal scroll.
- [ ] IMPL: responsive editor layout.

## Dev Notes

- Touches `/domain/validation/recipe.schema.ts`, `/app/actions/recipe-actions.ts`, `/app/recipes/new/**`, tests. Repo write primitives exist (S-202 `createWithLines`).
- Recipe + lines must persist in ONE transaction — no recipe row without its lines (S-202 provides this; do not bypass it).
- Instructions are free text (markdown-plain), NOT structured steps (A-2); a plain textarea is correct.
- Nutrition is NOT computed or displayed here (S-403); no tags yet (S-405).
- The editor is a client component by design (ADR-002) — but the Server Action re-validates everything (ADR-005).
- OUT of scope: edit/delete (S-402), nutrition display (S-403), recipe list features beyond "it appears" (S-404), tags (S-405).
