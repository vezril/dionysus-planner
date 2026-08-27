# Proposal: nutrition-intake

## Why

Calvin asked for (a) more trackable micronutrients — Thiamine,
Riboflavin, Niacin, Folate (already present as B1/B2/B3/B9 — relabel to
lead with the common names), plus Biotin, Pantothenate, Iodine,
Selenium, Copper, Manganese, Chromium, Molybdenum; and (b) nutrition
shown AS A SHARE OF his daily recommended intake — while building a
recipe (live preview), when viewing one (already shipped), and on the
planner's days.

## What changes

- Micronutrient registry: +8 keys (biotin, pantothenate, iodine,
  selenium, copper, manganese, chromium, molybdenum) with Health Canada
  adult-male DRI goal defaults; B-vitamin labels lead with common names.
  Registry-driven UIs (product form, custom item dialog, Targets editor,
  day view) pick them up with no further change. No migration — the
  ingredient_micronutrient table is key-driven.
- Recipe editor: live per-serving nutrition preview (debounced server
  action parsing the typed body) with % of daily target per nutrient.
- Planner: per-day calorie total + % of the daily calorie budget on each
  day card; eat_pantry entries (portion-ladder sized) and batch-backed
  eat_item entries now contribute calories instead of null.
- nutrition-reference skill updated with the new keys/defaults.

## Impact

- No schema migration, no service change, no new API routes.
- tests/unit/domain/micronutrients.test.ts count 17 → 25.
