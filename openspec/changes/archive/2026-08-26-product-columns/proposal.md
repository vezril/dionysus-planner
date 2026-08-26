# Product list column alignment

## Why
Product rows are justify-between flex: the per-100 nutrition spans
("44 kcal 1.2g protein…") wrap and drift per row — quantities don't
line up as columns.

## What Changes
- Product rows become fixed grid tracks on sm+ (name 1fr · unit class ·
  kcal · protein · carbs · fat · badges), numbers right-aligned in
  monospace tabular figures with per-100 units in the header, mobile
  keeps the wrapping layout.
- The sort header row aligns to the same tracks (Name over the name
  column, Calories over kcal, Category over the badges).

## Impact
ingredient-catalog rows + header, e2e pin (alignment-safe selectors
unchanged), gate, train v2.42.0.
