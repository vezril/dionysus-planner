# Sub-recipe links, eaten-now planner accounting, quick pantry adjust

## Why
User batch: reference recipes inside recipes (Obsidian-style link to a
"Cajun spice mix" from "Cajun chicken"); make Eat-now/Drink-now (cook
dialog + Inventory quick-log) land on the planner automatically; and a
fast way to correct pantry quantities when someone else uses stock.

## What Changes
- Sub-recipe links: `[[Name(id)]]` in instructions. Typing `[[` in the
  editor opens a recipe autocomplete (new GET /api/recipes?q=); read
  views render the ref as a link to the sub-recipe; backup markdown
  emits real Obsidian `[[Name]]` links. Pure parser additions
  (parseRecipeRefs, splitInstructionSegments); no schema change.
- Eaten-now accounting: cooking with "Eating now" > 0 records an
  eat_item plan entry on today for those portions, and the Inventory
  "Log 1" button records one too — immediate consumption always shows
  on the plan (matching the pantry Eat/Drink flow).
- Quick pantry adjust: each stocked row gets an Adjust control with
  ¾ / ½ / ¼ / Out presets (fractions of the current amount) using the
  existing update action; Edit stays for exact amounts.

## Impact
cooklangParser + unit tests, /api/recipes route, recipe editor +
detail, cook/meal-log actions + integration tests, PantryRow adjust
control, e2e, train v2.38.0.
