# S-402: Recipe edit & delete

**Epic:** E-4 Recipes & Nutrition | **Status:** TODO | **Depends on:** S-401
**Covers:** FR-14, FR-15

## Context

Recipe creation exists (S-401). This story adds editing an existing recipe's metadata and lines (add/remove/change quantity) via a pre-filled editor, and recipe deletion with line cascade. Read: prd.md FR-14, FR-15; architecture.md §4 RecipeLine (`ON DELETE CASCADE` on recipeId), §5 (`/app/recipes/[id]/edit/page.tsx` — client editor, pre-filled).

## Acceptance Criteria

1. Given an existing recipe, when its edit page opens, then name, servings, instructions, and every ingredient line (with display quantity/unit) are pre-filled (FR-14).
2. Given the edit form, when lines are added, removed, or have quantity/unit changed and saved, then the changes persist and are reflected in nutrition computation and matching on next view (FR-14 AC — downstream reflection is automatic per ADR-011's compute-fresh policy; asserted here at data level, end-to-end in S-403/S-501).
3. Given an edit removing all lines, when save is attempted, then it is blocked (FR-13's ≥1-line invariant holds on edit too).
4. Given a recipe, when deleted, then it disappears from the recipe list and from matching results, its lines are removed, and the ingredient catalog and pantry are unaffected (FR-15 AC).

## Tasks

- [ ] TEST: (integration, `tests/integration/recipe-actions.test.ts`) `updateRecipe` — metadata change persists; line added/removed/quantity-changed persists atomically (replace-lines semantics); canonical + display values recomputed for changed lines; edit to 0 lines rejected; concurrent-identity check (updating a nonexistent id returns not-found error shape).
- [ ] IMPL: `updateRecipe` in `app/actions/recipe-actions.ts` using `recipeRepo.updateWithLines`.
- [ ] TEST: (integration) `deleteRecipe` — recipe and its lines gone; referenced ingredients and pantry rows untouched; deleting again returns not-found error shape.
- [ ] IMPL: `deleteRecipe` action.
- [ ] TEST: (e2e, `tests/e2e/recipes.spec.ts`) edit flow — open existing recipe's edit page, all fields pre-filled; change a quantity and add a line; save; detail reflects changes. Delete flow — delete from the recipe UI with confirmation; recipe absent from list; pantry and ingredient catalog unchanged.
- [ ] IMPL: `app/recipes/[id]/edit/page.tsx` — pre-filled client editor (reuse S-401's editor component in edit mode) + delete affordance with confirm dialog.

## Dev Notes

- Touches `/app/actions/recipe-actions.ts`, `/app/recipes/[id]/edit/**`, tests. Reuses S-401's schema and editor component — do not fork a second editor.
- Line updates are replace-set semantics in one transaction (S-202's `updateWithLines`); do not diff-and-patch individual lines.
- Deletion cascade is DB-level (S-201) — the action just deletes the recipe row; tags (if present later) cascade too.
- No recomputation/caching concerns: nutrition and matching read fresh every view (ADR-011), so edits propagate automatically.
- OUT of scope: nutrition display (S-403), tags editing (S-405).
