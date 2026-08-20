## Context

Nutrition is stored per reference quantity (`REFERENCE_QUANTITY_BY_CLASS`: 100 g / 100 mL / 1 count) — a deliberate, single-basis invariant that removes "which basis is this row in" bugs (architecture §4). Every consumer (recipe nutrition, meal math, detail pages) assumes it. Packaged-goods labels, however, declare per-container or per-serving values, so entry currently requires manual conversion. Separately, the ingredient edit form (`/ingredients/[id]/edit`, which since custom-pantry-items covers nutrition + product identity) has no inbound link from the pantry views where custom items are managed.

## Goals / Non-Goals

**Goals:**
- Enter label values verbatim against any basis in the ingredient's unit class; the app converts.
- Keep the per-reference storage invariant completely untouched.
- One-click path from a pantry item's detail page to editing its details.

**Non-Goals:**
- No stored "original basis" — after save, values are per-reference, full stop. The edit form prefills with the reference basis; it does not reconstruct "per can". (Storing the entry basis adds columns and a second source of truth for zero read-path value; the package-size field already records the container size for anyone who wants to eyeball per-container numbers.)
- No unitClass editing (unchanged existing behavior — the update patch deliberately excludes it, since changing the class would silently rebase all stored values).
- No density-based cross-class basis (a per-mL basis for a MASS ingredient stays an error even when density exists — entry-time conversion should be predictable, not clever).

## Decisions

**1. Conversion is a pure domain function, applied in the Server Actions.**
`domain/nutritionBasis.ts`: `nutritionScaleFactor(basisQuantity, basisUnit, unitClass)` returns `REFERENCE_QUANTITY_BY_CLASS[unitClass] / toCanonical(basisQuantity, basisUnit).quantityCanonical`, erroring (typed result, not throw) when the basis unit's class ≠ the ingredient's class. Actions multiply the seven nutrition fields (nulls pass through) before persisting. Client forms submit raw label values + basis; the action owns the authoritative conversion (ADR-005 shape: schema validates, action computes).

**2. Schema: optional `nutritionBasisQuantity` (> 0) + `nutritionBasisUnit` (unit key), added to both `ingredientSchema` and `customPantryItemSchema`; absent ⇒ per-reference (back-compat for tests/callers).**
The class-consistency check lives in the action (it produces a `fieldErrors.nutritionBasisUnit` entry) rather than a schema refine — the schema can't see `UNITS`' class table without importing it, which it can (and `pantryItemSchema` does import UNITS)… but the *pairing* rule "basis unit class must equal unitClass" reads clearer as one place returning one field error alongside the scale application; keeping schema purely structural (present/positive/known-unit) and semantics in the action matches how unit-class increment rules are handled today.

**3. Forms default the basis to the selected unit class's reference (100 g / 100 mL / 1) and update the default when the class changes** — an untouched form behaves exactly as today. The nutrition fieldset legend reads "per ⟨basis⟩" live so the user always sees what they're entering against.

**4. `/pantry/[id]` gets an "Edit details" link to `/ingredients/{ingredientId}/edit`.**
Reuses the existing form/route (no new edit surface); the ingredient form's save already returns to `/ingredients` — acceptable for now rather than threading a returnTo param (kept minimal; can add later if the round-trip annoys).

## Risks / Trade-offs

- **[Risk] Floating-point scaling produces long decimals (492 kcal per 355 mL → 138.59… per 100 mL).** → Round to 4 decimal places at conversion time — far below nutritional significance, avoids `138.59154929577466` in the UI.
- **[Risk] A user edits a previously-basis-entered item and misreads the prefilled per-reference values as their label entry.** → The edit form's basis defaults to the reference and the legend states the basis explicitly; documented behavior (non-goal: no original-basis storage).

## Migration Plan

None — no schema change, no data change. Rollback = revert the code.

## Open Questions

- None blocking.
