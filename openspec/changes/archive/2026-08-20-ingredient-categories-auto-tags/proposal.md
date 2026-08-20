# Custom product categories + auto recipe tags

## Why
The user wants custom, user-defined category labels on products/generics
("fish", "salmon"), and recipes that use those products to pick the
labels up as tags automatically — add salmon to a recipe, the recipe is
tagged fish + salmon.

## What Changes
- New `ingredient_tag` table (migration 0014): free-text categories on
  any product or generic, replace-set semantics like micronutrients.
- Both product forms (full editor + pantry quick-create) gain a
  comma-separated "Categories" input; edit round-trips them.
- Recipes derive tags automatically: the union of the categories of
  each line's ingredient AND that ingredient's generic root. Derived
  tags are COMPUTED at read time (never stored) — recipe list rows show
  and filter on manual ∪ derived; the detail page shows derived tags as
  muted chips; the edit form keeps only manual tags.

## Impact
- schema/migration, ingredientRepo, data/ingredients, both ingredient
  actions + forms, recipeRepo derived-tag queries, data/recipes facades,
  recipe catalog + detail, tests (integration + e2e recipe-tags).
