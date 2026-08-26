# Category nutrition defaults + prefill

## Why
Categories should optionally carry nutrition — all "Lightly Aged Pot
Rhum" bottles share roughly one label — so creating a product in a
known category prefills what Open Food Facts often lacks.

## What Changes
- Migration 0017: category_nutrition (path-keyed, per-100 g/mL,
  every value optional: kcal, protein, carbs, fat, % ABV).
- Pure resolution (domain/categoryDefaults.ts): deepest matching path
  wins (exact path, then ancestors), first-listed category breaks
  ties, case-insensitive.
- The products "By category" tree gets a per-node Defaults editor
  (set/clear); nodes with defaults show a chip.
- Both product create forms prefill EMPTY nutrition fields from the
  resolved defaults when categories are entered (via GET
  /api/category-defaults), with a "prefilled from <category>" note —
  typed values are never overwritten.

## Impact
schema/migration, repo/facade/action, api route, categoryTree UI +
both forms, unit + integration + e2e, train v2.40.0.
