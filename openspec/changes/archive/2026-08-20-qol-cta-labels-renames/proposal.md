# Proposal: qol-cta-labels-renames

## Why

Four QoL items from Calvin's 2026-08-20 list: the recipe list has no
create button once recipes exist (only the empty state does); nutrition
inputs don't say their unit (is Sodium mg or g?); "Ingredients"
undersells a catalog that now holds branded products (a can of beer is a
product, not an ingredient); and "Meals" reads as an action, not the
"what's ready to consume" overview Calvin wants (frozen batches ARE
inventory).

## What Changes

1. `/recipes` header gains a persistent "New recipe" link.
2. Every nutrition input carries its unit in the label: Calories (kcal),
   Protein/Carbs/Fat/Fiber/Sugar/Alcohol (g), Sodium (mg), Density
   (g/mL) — ingredient form and custom-item dialog.
3. **Ingredients → Products**: nav label, h1s, "Add product"/"Edit
   product". Routes stay `/ingredients` (the Meals-rename precedent).
4. **Meals → Inventory**, made true by restructuring the landing: a
   "Ready to consume" section first (batches with remaining portions +
   the quick-log button), "Today's intake" (day totals + meals) below.
   Sub-page h1s become Inventory Products/Recipes/Batches; routes stay
   `/meal-log`.

## Impact

- Label/heading churn across nav, catalog, forms, meal-log pages; the
  landing page gains a batches fetch. Pinned e2e strings updated
  deliberately. No schema or storage changes.
