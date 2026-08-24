# Hierarchical categories (category tree)

## Why
Categories are flat labels. The user wants broad → narrow taxonomy
(Rhum → Lightly Aged Pot Rhum → products) with products browsable
under it.

## What Changes
- Path convention in the EXISTING categories field: "Rhum/Lightly Aged
  Pot Rhum". No schema change.
- Products page gains a "By category" view toggle: a nested tree
  (details/summary) of category levels with products as leaf links;
  composes with search (matching products kept, empty branches
  pruned). Plain single-level categories keep working as top nodes;
  uncategorized products group under "Uncategorized".
- Derived recipe tags expand each path into its level names ("Rhum" AND
  "Lightly Aged Pot Rhum"), so recipes inherit the broad category too.
- Both category form fields hint the path syntax.

## Impact
domain/categoryTree.ts + unit tests, recipeRepo derived-tag expansion
+ integration test, ingredient-catalog view toggle, form hints, e2e,
train v2.37.0.
