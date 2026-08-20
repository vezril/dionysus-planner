# Proposal: qol-nav-scale-delete

## Why

Three quality-of-life gaps from daily use (Calvin's 2026-08-20 list):
sidebar order doesn't match the mental model (ingredients feed the pantry,
the pantry feeds recipes, recipes become meals); a recipe's quantities are
frozen at its authored serving count (a 4-portion recipe can't preview 6
portions without mental math); deleting a recipe requires detouring
through the edit page.

## What Changes

1. **Sidebar order + rename.** Nav becomes: What Can I Cook (home, stays
   first), Ingredients, Pantry, Recipes, **Meals** (renamed from "Meal
   Log", h1s included — the nav-label-equals-h1 convention holds).
2. **Portion slider on `/recipes/{id}`.** A slider (1 to 4× the authored
   servings, default = authored) that linearly rescales the displayed line
   quantities and nutrition totals. Per-serving values are unchanged by
   definition. Client-side only — nothing persisted, nothing recomputed
   server-side. Non-linear scaling ("1 large onion for 4 ≠ 1.5 for 6") is
   explicitly out of scope: v1 shows exact linear values; a future
   per-ingredient scaling-hint concept can refine COUNT lines.
3. **Delete from the recipe view.** The existing confirm-dialog delete
   (`DeleteRecipeButton`, edit page) also renders on the detail page.
   Same guarantees: two-action dialog, cancel does nothing, referenced-
   by-meals errors surface inline.

## Impact

- `components/nav.tsx`, meal-log page h1s, `/recipes/[id]` (slider client
  component + delete button), shell/meal-log/recipe e2e pins updated
  deliberately. No schema, storage, or domain-math changes (scaling is
  display multiplication).
- Sets up cook-recipe-into-meals: the slider's chosen portion count is the
  quantity the cook flow will consume.
