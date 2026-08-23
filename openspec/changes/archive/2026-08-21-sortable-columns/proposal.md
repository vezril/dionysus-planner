# Sortable column titles (pantry, products, inventory)

## Why
The pantry, products, and Inventory ready-to-consume lists render in
fixed order; the user wants clickable column titles to sort.

## What Changes
- Pure sort helpers (domain/listSort.ts): case-insensitive strings,
  numbers, null-last, direction toggle.
- Shared SortButton header control (aria-sort, ▲/▼ indicator; first
  click ascending, second flips).
- Pantry: header row over the existing grid tracks — Name / Quantity /
  Stocked sortable (client island wrapping the rows).
- Products: Name / Calories / Category sort headers alongside search.
- Inventory ready-to-consume: Name / Portions sort headers.

## Impact
domain/listSort + tests, components/SortButton, pantry/ingredient/
meal-log list islands, e2e, train v2.35.0.
