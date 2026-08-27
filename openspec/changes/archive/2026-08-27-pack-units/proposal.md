# Proposal: pack-units

## Why

Pre-portioned products have TWO sizes: the box you buy (366 g of
oatmeal) and the pack you actually use (6 × 61 g). Today only the outer
package exists, so cooking "one pack" means remembering 61 g every time
— in the recipe editor, the Eat dialog, and pantry adjustments.

## What changes

- `ingredient.packQuantity` + `packUnit` (migration 0019, both nullable):
  the inner pre-portioned pack, alongside the existing outer package.
  Product form and custom-item dialog gain "Pack size" fields with a
  "≈ N packs per package" hint when both sizes are set.
- `pack` / `packs` becomes a valid mention unit in recipe bodies:
  `@Oatmeal{1%pack}` resolves to 61 g at line-building time (display
  stays "1 pack"). A pack mention on a product with no pack size is a
  body validation error naming the fix. Live preview understands it too.
- Eat/Drink dialog prefills one pack (before the package fallback);
  pantry Adjust gains a "−1 pack" preset; the portion ladder becomes
  COUNT → pack → package → 100 g/mL reference (planner consumption and
  day calories follow automatically).
- Mobile POST /api/mobile/products accepts the two fields (documented,
  Insomnia regenerated).

## Impact

- Migration 0019 (additive). resolveQuantityForComparison untouched —
  packs expand to real units BEFORE canonicalization, at entry
  boundaries only (no parallel conversion path).
