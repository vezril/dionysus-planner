# Highlight missing ingredients on the recipe detail page

## Why
Opening a near-match recipe doesn't show WHICH ingredients the pantry
lacks — the user has to open the cook dialog to find out.

## What Changes
- The recipe detail ingredient list badges each line the pantry can't
  cover at the authored servings, using the cook-preview plan (grouped
  generic/product matching, no service dependency): "missing from
  pantry" (red) and "not enough in pantry" (amber). Covered lines and
  multi-product choice lines stay unbadged; the existing unresolved
  badge is unchanged.

## Impact
- app/recipes/[id]/page.tsx (call previewCook at base servings),
  PortionScaler lines (badge rendering), e2e.
