# Design: qol-nav-scale-delete

## D1 — Nav order and the Meals rename

`NAV_ITEMS` order: What Can I Cook, Ingredients, Pantry, Recipes, Meals.
What Can I Cook stays first because `/` redirects there — it is the home
screen, not part of the data-flow sequence the other four follow.

"Meal Log" → "Meals" renames the nav label AND every `/meal-log` h1 that
currently says "Meal Log" (nav accessible name must equal the destination
h1 — the shell.spec.ts convention survives, its pinned strings update).
Routes stay `/meal-log` — URL churn buys nothing.

## D2 — Portion slider is pure display math

A client component (`PortionScaler`) on the recipe detail page owning a
slider: min 1, max `4 × servings`, step 1, default `servings`. Factor =
`selected / servings`.

- Line quantities: `displayQuantity × factor`, formatted to at most 2
  decimals (trailing zeros trimmed) — the same precision posture as the
  rest of the app. Units untouched.
- Nutrition totals: `totals × factor` recomputed client-side from the
  values the RSC already delivered — no new server round-trip, no changes
  to `computeRecipeNutrition`. Per-serving column is factor-independent.
- Incomplete totals (N/A) stay N/A at any factor.
- At factor 1 the page renders byte-identically to today (the slider is
  additive, no existing test pin moves).

Rejected: server-side scaled recompute (a fetch per slider tick for a
multiplication); persisting a "preferred portions" (premature — the cook
flow will take the value as an argument instead). Non-linear COUNT
scaling is deliberately deferred: the honest linear number ("1.5 each")
beats a guessed rounding, and a future scaling-hint field can override
per ingredient.

The scaled portion count is exposed via a `data-portions` attribute /
component state so cook-recipe-into-meals can lift it later.

## D3 — Delete on the detail page reuses the existing button

`DeleteRecipeButton` is already self-contained (dialog, action call,
navigate-to-/recipes on success, inline error on failure). The detail
page renders it in the header area; the edit page keeps its copy. No new
action, no new dialog component.
