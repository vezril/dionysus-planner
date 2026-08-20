# Proposal: cook-recipe-into-meals

## Why

The planner and the meal service are still manually bridged: cooking a
recipe means re-entering it as service recipes/batches/meals and manually
decrementing the pantry. The recipe view should close the loop — one
button from "I'm cooking this at N portions" to logged meals and an
updated pantry.

## What Changes

1. **Cook button on `/recipes/{id}`.** Takes the portion slider's current
   count (from qol-nav-scale-delete). Clicking opens a cook dialog
   summarizing what will happen: N portions, per-line pantry consumption
   (scaled quantities resolved via the existing unit-resolution machinery,
   package bridge included).
2. **Missing/unresolved lines get a per-line choice** in the dialog:
   - **Ignore** — cook without consuming that line (still logged in the
     meal's nutrition? No: ignored lines are excluded from consumption but
     INCLUDED in nutrition — you still ate it, you just didn't track the
     stock).
   - **Substitute** — pick another pantry ingredient + quantity to consume
     instead (nutrition follows the substitute for that line).
3. **On confirm**, atomically:
   - decrement consumed pantry rows (never below zero — a shortfall
     consumes to zero rather than erroring, flagged in the summary),
   - create the corresponding service objects via the existing meal-log
     actions (recipe if not yet mirrored, batch of N portions, N meals or
     one meal entry of N portions — resolve against the service's
     Recipe→Batch→Meal model during design),
   - surface one result: "Cooked 6 portions — pantry updated, meals
     logged" with a link to Meals.
4. **Failure semantics:** service unreachable → nothing is consumed
   (pantry decrement and service writes must not partially commit; order
   and compensation decided in design).

## Impact

- New Server Action orchestrating pantry repo + service client; cook
  dialog component; recipe detail wiring. Service API itself unchanged.
- Depends on qol-nav-scale-delete (slider value feeds the flow).

## Open questions (for design)

- Batch/meal granularity on the service side (one batch + N meals vs one
  meal with portions).
- Whether substitutes are remembered per recipe line for next time.
