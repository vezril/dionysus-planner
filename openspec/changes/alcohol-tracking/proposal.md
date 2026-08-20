# Proposal: alcohol-tracking

## Why

Alcohol is invisible to the tracker today. Before building functionality
around it (weekly limits, day-log annotations, drink math), the CONCEPT
needs to exist in the data model — Calvin explicitly wants the simple
version first.

## What Changes

1. **`alcoholGPerRef`** — optional nullable column on `ingredient`, per
   reference quantity, exactly the fiber/sugar/sodium pattern (null =
   not recorded, never a stand-in zero).
2. Threaded everywhere the optional trio already flows: entry forms
   (ingredient + custom item, including nutrition-basis conversion),
   detail pages, recipe nutrition totals/per-serving (complete only when
   every constituent has it), meal-log ingredient mirroring if applicable.
3. Display label "Alcohol" with unit g. No derived calories, no limits,
   no warnings — concept only.

## Impact

- One migration (add column), schema field, form inputs, nutrition
  computation + display rows, tests. Mechanically identical to an
  existing optional nutrient — low risk.
- Future changes build on it (drink logging, weekly view in Meals).
