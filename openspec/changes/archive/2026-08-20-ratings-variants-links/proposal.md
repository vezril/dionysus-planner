# Ratings, recipe variations, merchant links, consume QOL

## Why
User batch: rate recipes; create variations (decided: linked variant
recipes); attach local-merchant URLs to products (future demeter deal
input); the "alcohol in grams" confusion on the add form (not a
regression — the ABV field only appears for Drink+Volume and new
products default to Food); drink-aware quick-consume wording.

## What Changes
- Migration 0015: recipe.rating (1–5, null unrated), recipe.variantOfId
  (root link, genericOfId posture), ingredient_link table (URLs).
- Rating: star control on the recipe detail page (click to set, click
  the same star to clear); rating shown on list rows.
- Variations: "Create variation" on the detail page duplicates the
  recipe (lines + manual tags) as its own recipe linked to the ROOT
  recipe, opening its edit page. Detail shows "Variation of <root>" and
  the root lists its variations; list rows note "variation of X".
- Merchant links: one-URL-per-line textarea on the full product form
  (http/https validated, replace-set, edit round-trip); links shown on
  the pantry item detail page.
- ABV hint: the "Alcohol (g)" field on both product forms carries a
  hint that Drink + Volume switches it to % ABV entry.
- Consume QOL: checkbox relabeled "Ready to consume"; the pantry
  quick-consume button/dialog says Drink for DRINK products, Eat
  otherwise.

## Impact
schema/migration 0015, recipeRepo/ingredientRepo + facades, recipe
detail/list/actions, product form + pantry detail, EatItemButton +
PantryRow + pantryRepo (category), both form labels, tests.
