# S-303: Ingredient deletion rules

**Epic:** E-3 Ingredients & Pantry | **Status:** DONE (2026-07-11) | **Depends on:** S-302
**Covers:** FR-4

## Context

Ingredient create/override exists (S-302); FK RESTRICT backstops exist in the schema (S-201). This story adds the `deleteIngredient` Server Action with the friendly referencing-records check, and the UI affordance rules: delete exists only for unreferenced CUSTOM ingredients, and is absent for seeded ones. Read: prd.md FR-4, A-4; architecture.md §4 Ingredient `source` field note (UI half of FR-4), RecipeLine/PantryItem FK notes, §6 error-handling (pre-empt FK errors with a referencing query, DB constraint as backstop).

## Acceptance Criteria

1. Given an unreferenced CUSTOM ingredient, when deleted, then it is removed and disappears from the catalog (FR-4).
2. Given a CUSTOM ingredient referenced by ≥1 recipe line and/or pantry item, when deletion is attempted, then it is blocked and the response lists the referencing recipes (by name) and pantry presence (FR-4 AC — friendly listing, not a raw FK error).
3. Given a SEEDED ingredient, when its catalog row/edit view renders, then no delete affordance exists; when a delete request is forced directly at the Server Action, then it is rejected (seeded ingredients are never deletable — override-only per FR-3/FR-4).
4. Given a race where the referencing check passes but the FK RESTRICT still fires, when it happens, then the action catches it and returns the same blocked-error shape (architecture §6).

## Tasks

- [ ] TEST: (integration, `tests/integration/ingredient-actions.test.ts`) `deleteIngredient` — unreferenced CUSTOM deletes; CUSTOM referenced by a recipe line blocks with recipe names in the error payload; CUSTOM in the pantry blocks listing pantry; referenced by both lists both; SEEDED always rejected regardless of references.
- [ ] IMPL: `deleteIngredient` in `app/actions/ingredient-actions.ts` — guard `source==='SEEDED'`, call `ingredientRepo.getReferencesTo`, block-with-listing, else delete; catch residual FK violation and map to the same error shape.
- [ ] TEST: (e2e, `tests/e2e/ingredient-forms.spec.ts`) delete affordance — visible/enabled on an unreferenced custom ingredient (and works); absent/disabled for a seeded ingredient; attempting delete on a referenced custom ingredient shows the blocking message with the referencing recipe named (FR-4 AC end-to-end).
- [ ] IMPL: delete button + confirm dialog in catalog/edit UI, rendered only when `source === 'CUSTOM'` (architecture §4); blocked-state message rendering.

## Dev Notes

- Touches `/app/actions/ingredient-actions.ts`, `/app/ingredients/**` UI, tests. Uses S-202's `getReferencesTo`; no schema changes (RESTRICT already in place from S-201).
- Hard-block is the v1 UX — no soft-delete, no archive, no cascade (A-4, architecture §4).
- The referencing-records query and the delete should run such that the friendly path is normal and the FK error path is exceptional-but-handled (architecture §6).
- OUT of scope: recipe/pantry deletion (S-402/S-305), bulk operations.
