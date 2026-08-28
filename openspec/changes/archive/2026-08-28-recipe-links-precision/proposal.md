# Proposal: recipe-links-precision

## Why

Three papercuts Calvin hit in normal use:

- A recipe's ingredient list is a dead end — you can see "61 g, Pack
  Oatmeal" but can't get to that product's nutrition or purchase
  history without navigating to the pantry and searching.
- Float arithmetic leaks into the UI. Conversions, pack subtraction,
  and portion math produce values like `305.00000000000006`, which
  overflow their columns and read as noise.
- The planner's day cards are ~130px wide at the 7-column breakpoint;
  the new Eat button plus the ✕ overflow the card box.

## What changes

- `domain/quantityFormat.ts#formatQuantity` — at most 2 decimals,
  trailing zeros dropped ("305", "1.5", "0.33"). Applied at every site
  that renders a raw quantity/portion: pantry list + detail, Eat and
  Adjust dialogs, planner picker/suggestions/day entries, batches
  admin, meal-log form, cook dialog, portion scaler. Nutrition keeps
  its own `formatNutritionForDisplay` rounding (1 decimal, unchanged).
- Recipe detail ingredient rows become links: to `/pantry/<itemId>`
  when the product is stocked (nutrition facts + purchase history),
  else `/ingredients/<id>/edit` (the product record) — the two
  existing per-product destinations, no new page.
- Planner day-card entry footer wraps instead of overflowing: the
  meta text truncates, the button pair stays intact.

## Impact

- No schema change, no API change, no service change.
- `formatQuantity` is display-only — it never feeds arithmetic, so the
  canonical/comparison paths are untouched.
