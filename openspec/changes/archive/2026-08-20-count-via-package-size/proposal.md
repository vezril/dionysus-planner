# Proposal: count-via-package-size

## Why

A can of Fanta (VOLUME, package size 355 mL) added to a recipe as "1 each"
shows **Unresolved — cannot compare units**: COUNT can't bridge to VOLUME,
and density only bridges MASS↔VOLUME. But the user already told us what a
can *is* — `packageQuantity`/`packageUnit` from the custom-item form. "1
each of a packaged item" should just resolve.

Found live on 2026-08-20: pantry "1 each" and recipe line "1 each" of the
Fanta ingredient both unresolved, breaking cookability and recipe nutrition
for the whole recipe.

## What Changes

1. **Package-size bridge in unit resolution.** When one side of a
   comparison is COUNT and the ingredient carries a package size whose unit
   class matches the other side, resolve via `1 each = package size`. Both
   directions: "2 cans" of a VOLUME ingredient → 710 mL; "100 g" against a
   COUNT ingredient packaged as 200 g → 0.5 each. Applies everywhere
   `resolveQuantityForComparison` is used (matching, cookability, recipe
   nutrition) — one choke point.
2. **Package unit becomes a real unit.** `packageUnit` today is free text
   ("ml" got stored, which is not a unit key). Schemas restrict it to a
   known unit key; both forms (ingredient create/edit, custom-item dialog)
   swap the text input for the unit select. A data migration normalizes
   existing case-variant values ("ml" → "mL"); values that still match
   nothing behave as no package (unresolved, as today — never a guess).

## Impact

- `domain/units.ts` (resolution), `domain/validation/*` (packageUnit),
  both entry forms, one data migration. Matching/nutrition callers pass
  two more ingredient fields; no storage format changes.
- Non-goal: COUNT↔COUNT packaging ("1 box = 12 each"), density changes,
  or any UI beyond the packageUnit select.
