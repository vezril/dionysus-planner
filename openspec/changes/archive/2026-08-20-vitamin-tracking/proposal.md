# Proposal: vitamin-tracking

## Why

Calvin takes daily vitamins/supplements and wants them tracked alongside
food. That means (a) ingredients can carry vitamin values, (b) supplements
become trackable items (a COUNT ingredient with vitamin values IS a
supplement — one capsule = 1 each), and (c) totals surface what was
actually consumed.

## What Changes

1. **Micronutrient registry in domain** (`domain/micronutrients.ts`): a
   versioned code constant (like UNITS) listing tracked nutrients — key,
   label, unit (µg/mg/IU) — starting set: vitamins A, C, D, E, K, B1, B2,
   B3, B6, B9 (folate), B12, plus calcium, iron, magnesium, potassium,
   zinc. Extending the registry must not require a schema migration.
2. **Storage as rows, not columns:** `ingredient_micronutrient`
   (ingredientId, nutrientKey, amountPerRef) — sparse by nature (most
   foods have a handful, supplements have many, seeded USDA rows start
   with none). Same per-reference basis + nutrition-basis conversion as
   macros.
3. **Forms:** an "Add micronutrient" repeatable row (nutrient select +
   amount) on the ingredient form and custom-item dialog — not 16 empty
   inputs.
4. **Display:** detail pages and recipe nutrition render only nutrients
   present; recipe totals sum per nutrient across lines that have it
   (partial coverage displayed as "at least", not hidden — design to
   settle exact semantics vs the strict all-or-N/A macro rule).
5. **Supplements flow:** creating "Vitamin D3 1000 IU" as a COUNT custom
   item with micronutrients, pantry-held, cookable into the day via the
   future cook/log flows. No dedicated supplement UI in this change.

## Impact

- New domain registry + table + repo, form UX, nutrition aggregation
  extension, migration. Medium-large; isolated from macro math.
- Meal-service mirroring of micronutrients is out of scope here (planner
  first; service schema follows in its own change).

## Open questions (for design)

- IU vs µg for D/A (registry stores one canonical unit; forms may offer
  IU conversion).
- Partial-coverage totals semantics ("at least X mg" vs N/A).
