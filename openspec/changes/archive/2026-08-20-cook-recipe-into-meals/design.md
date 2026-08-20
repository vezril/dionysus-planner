# Design: cook-recipe-into-meals

## D1 — What "cook" creates on the service side

Cooking N portions creates a **Batch** (`servingsMade = N`) against a
**mirrored service recipe** — not N meal entries. Meals are consumption
events and stay with the existing Meals › Log flow; a batch with N
remaining portions IS "N portions added to Meals". Batch-portion meal
nutrition = mirror recipe perServing × portions (service semantics), so
per-portion nutrition is independent of how many portions were cooked —
linear scaling matches the portion slider by construction.

## D2 — Mirroring planner ingredients/recipes into the service

Service ingredient nutrition is "per 1 unit of the line's quantity"
(RecipeNutrition.scala). Mirror rules:

- Per planner line, resolve the line quantity into the INGREDIENT's
  canonical class (density + package bridge, existing machinery). The
  service line is `{ quantity: resolvedCanonical, unit: "g"|"mL"|"each" }`.
- The mirrored service ingredient (matched by exact name, created if
  absent) carries nutrition per 1 canonical unit: `perRef / REF` (÷100 for
  MASS/VOLUME, ÷1 for COUNT). Null optional sodium mirrors as 0 (service
  fields are non-null) — documented fidelity loss. `directlyLoggable:
  false`, `abvPercent: null`.
- The mirrored recipe (matched by exact name, created if absent) uses the
  AUTHORED servings and AUTHORED line quantities — the batch's
  `servingsMade` carries the cook-time portion count.
- A line that cannot resolve into its ingredient's class is EXCLUDED from
  the mirror (its nutrition is uncomputable) — surfaced in the dialog as
  unresolved.

Accepted v1 simplifications (documented, revisit on demand): mirror
reuse-by-name means a later planner-recipe edit does not re-mirror;
substitutions affect pantry consumption only, not batch nutrition.

## D3 — Pantry consumption

For each non-ignored line: scaled requirement = line canonical × factor
(factor = portions / authored servings), resolved into the pantry row's
own `entryUnitClass` basis (density + package bridge). Decrement floors
at zero — a shortfall consumes to zero and is flagged in the result,
never an error (you cooked it; the tracker follows reality). All
decrements run in ONE local transaction.

Line statuses in the preview: `ok` (stock covers it), `insufficient`
(consumes to zero, flagged), `missing` (no pantry row), `unresolved`
(cannot compare units, or cannot mirror). `missing`/`unresolved` lines
require a cook-time choice: **ignore** (skip consumption; unresolved also
skips nutrition — nothing to compute) or **substitute** (consume a chosen
pantry item's quantity instead; v1 nutrition still follows the authored
line per D2).

## D4 — Orchestration order and failure semantics

Two Server Actions:

- `previewCook(recipeId, portions)` → per-line status + scaled
  requirements + the pantry item list (for the substitute picker).
- `cookRecipe(input)` with `{recipeId, portions, lines: [{lineId, action:
  consume|ignore|substitute, substituteIngredientId?, substituteQuantity?,
  substituteUnit?}]}` — re-derives everything server-side (client
  declarations are requests, not truth; a "consume" on a line the server
  finds missing is a VALIDATION_ERROR).

Order: service writes FIRST (ensure ingredient mirrors → ensure recipe
mirror → create batch), pantry decrement transaction SECOND. Service
unreachable → nothing consumed, SERVICE_ERROR out. Local tx failure
after the batch exists is the accepted residual risk (rare; the error
message says the batch was logged but the pantry was not updated).

## D5 — UI

`CookRecipeDialog` (client) on the recipe detail page next to the
portion slider, taking the slider's current portion count. Open →
`previewCook` → per-line rows with status badges; missing/unresolved rows
get Ignore/Substitute controls (substitute = pantry-item select +
quantity + unit). Confirm → `cookRecipe` → success panel "Cooked N
portions — pantry updated, batch logged" linking to `/meal-log/batches`;
failure renders the action message inline.
