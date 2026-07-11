# S-305: Pantry item edit & remove

**Epic:** E-3 Ingredients & Pantry | **Status:** TODO | **Depends on:** S-304
**Covers:** FR-7, FR-8

## Context

The pantry view and add flow exist (S-304). This story completes pantry CRUD: editing an item's quantity/unit (UJ-1 "used some") and removing an item entirely. Read: prd.md FR-7, FR-8, UJ-1; architecture.md §4 PantryItem, §6 error handling.

## Acceptance Criteria

1. Given an existing pantry item, when its edit form opens, then it pre-fills the CURRENT display quantity and unit (FR-7 AC).
2. Given the edit form, when a new quantity/unit is saved, then the list updates immediately, canonical + display values are both rewritten consistently (via `toCanonical`), and `entryUnitClass` reflects the new unit (FR-7, FR-9).
3. Given a pantry item, when removed, then it disappears from the list and is excluded from all subsequent matching calculations (FR-8 AC — matching exclusion asserted fully once S-501 exists; here via the repo/index level).
4. Given invalid edits (non-positive quantity, unknown unit), when submitted, then inline errors block save and the Server Action independently rejects (ADR-005).

## Tasks

- [ ] TEST: (integration, `tests/integration/pantry-actions.test.ts`) `updatePantryItem` — rewrites canonical/display/entryUnitClass consistently for same-class and cross-class new units; rejects invalid input; `deletePantryItem` — removes the row; `pantryRepo.getAllAsIndex()` no longer contains the ingredient (FR-8 matching-exclusion proxy).
- [ ] IMPL: `updatePantryItem` + `deletePantryItem` in `app/actions/pantry-actions.ts`.
- [ ] TEST: (e2e, `tests/e2e/pantry.spec.ts`) edit flow — open edit on an item, form pre-filled with current values, change 2 lb → 1 lb, list shows "1 lb" immediately.
- [ ] IMPL: edit affordance reusing `PantryItemForm` in edit mode (pre-filled, per FR-7 AC).
- [ ] TEST: (e2e) remove flow — remove an item, it disappears from the list; empty state returns when the last item is removed (FR-29 continuity).
- [ ] IMPL: remove button + confirmation in the pantry list.

## Dev Notes

- Touches `/app/actions/pantry-actions.ts`, `/app/pantry/**`, tests. Reuses S-304's schema and form component; no new domain/data code.
- Editing to a unit in a different class is legal (FR-6's permissive-entry pattern applies to edits too); it simply changes `entryUnitClass` — comparability is FR-11/FR-12's concern downstream, not a validation error here.
- Removal is a hard delete of the pantry row only — the ingredient catalog entry is untouched.
- OUT of scope: add/upsert (S-304), any matching UI (S-501).
