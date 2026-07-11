# S-304: Pantry view & add item (upsert with increment/replace)

**Epic:** E-3 Ingredients & Pantry | **Status:** DONE (2026-07-11) | **Depends on:** S-301, S-102
**Covers:** FR-6, FR-9, FR-29 (pantry empty state) / FR-11 (increment rejection consistency), FR-12 (increment via density)

## Context

The catalog + search API (S-301) and the unit engine (S-102) exist. This story builds the Pantry view and the add flow: ingredient picker (combobox over `/api/ingredients?q=`), quantity+unit entry, and the `addOrUpdatePantryItem` Server Action implementing FR-6's one-row-per-ingredient upsert with the human-confirmed increment rule. Read: prd.md FR-6, FR-9, FR-29, UJ-1; architecture.md §4 PantryItem (the FULL increment semantics live in the `ingredientId` field note — reject cross-class increment without density, offer replace), ADR-005, §6 error handling.

## Acceptance Criteria

1. Given the pantry with no item for ingredient X, when the user adds X with quantity 2 lb, then one pantry row appears showing "2 lb", storing ≈907.184 g canonically with `entryUnitClass=MASS` and verbatim display values (FR-6, FR-9).
2. Given X already in the pantry, when the user adds X again, then the UI requires a choice — increment or replace — and the result is ONE pantry row, never two (FR-6 AC).
3. Given increment where the incoming unit's class equals the existing row's `entryUnitClass`, when confirmed, then the incoming quantity converts to the existing row's canonical basis and sums (FR-10 path; e.g., existing 500 g + incoming 1 lb → ≈953.592 g).
4. Given increment where classes differ and the ingredient has a density, when confirmed, then the incoming quantity density-converts and sums (FR-12 path).
5. Given increment where classes differ and NO density exists, when attempted, then the increment is REJECTED with an explanatory message and the user is offered "replace" instead — never a silent guess (FR-11-consistent rule, architecture §4; human-confirmed).
6. Given a replace choice, when confirmed, then the row's quantity/unit (canonical + display + entryUnitClass) are overwritten with the new entry.
7. Given an empty pantry, when `/pantry` loads, then a defined empty state with an "Add your first pantry item" CTA renders — never blank or an error (FR-29).
8. Given invalid input (no ingredient selected, non-positive quantity, unknown unit), when submitted, then inline errors block the save client-side and the Server Action independently rejects (ADR-005).

## Tasks

- [ ] TEST: (unit, `tests/unit/domain/pantry-schema.test.ts`) `domain/validation/pantryItem.schema.ts` — ingredientId required, quantity positive number, unit ∈ UNITS keys, mode ∈ {new, increment, replace} as applicable.
- [ ] IMPL: `pantryItem.schema.ts` (Zod).
- [ ] TEST: (integration, `tests/integration/pantry-actions.test.ts`) `addOrUpdatePantryItem` — fresh add stores canonical + verbatim display (FR-9 AC values); duplicate add without a mode choice returns a "needs-choice" result (or is rejected) rather than creating a row; same-class increment sums correctly; cross-class increment with density sums via density; cross-class increment without density returns the rejection error offering replace; replace overwrites all quantity fields; DB unique constraint never trips (one row per ingredient).
- [ ] IMPL: `app/actions/pantry-actions.ts#addOrUpdatePantryItem` — Zod parse, `toCanonical`, upsert per architecture §4 increment semantics, discriminated-union results.
- [ ] TEST: (e2e, `tests/e2e/pantry.spec.ts`) empty pantry shows FR-29 empty state with CTA; adding an item via combobox search + quantity + unit shows it listed with the entered display unit.
- [ ] IMPL: `app/pantry/page.tsx` (RSC list via pantryRepo) + `_components/PantryItemForm.tsx` (client dialog, combobox on `/api/ingredients?q=`, unit select scoped to the full FR-10 unit set, react-hook-form + zod).
- [ ] TEST: (e2e) duplicate-add flow — adding an existing ingredient surfaces the increment/replace choice; choosing increment updates the single row; forcing the cross-class-no-density case shows the rejection message and offers replace.
- [ ] IMPL: increment/replace choice UI + rejection message handling in the form.
- [ ] TEST: (e2e, mobile project) pantry usable at 375px (NFR-8).
- [ ] IMPL: responsive pantry list layout.

## Dev Notes

- Touches `/domain/validation/pantryItem.schema.ts`, `/app/actions/pantry-actions.ts`, `/app/pantry/**`, tests. No repo changes expected (S-202 primitives suffice).
- The increment rule is human-confirmed and exact (architecture §4 PantryItem): same class → convert+sum; cross-class + density → convert+sum; cross-class no density → REJECT with message + offer replace. Do not "helpfully" guess.
- Unit dropdown: FR-10's AC says a mass-class ingredient offers exactly the mass set — scope the unit choices by selected unit class family in the UI, while still permitting entry in a class other than the ingredient's primary class (FR-6 explicitly allows it; FR-11 then governs comparability).
- Canonical conversion happens in the Server Action (write path per architecture §4); display values persist verbatim — no lossy round-trip (FR-9).
- OUT of scope: edit/remove (S-305), matching behavior of unresolved pantry entries (S-104/S-501), inline ingredient creation (link to S-302's form is sufficient).
