# Proposal: eat-now-and-quick-log

## Why

Cooking creates a batch, but eating still takes a manual trip through
Meals › Log — Calvin cooked, then looked at the Meals day view and saw
nothing (2026-08-20). The common case is "I cooked and I'm eating a
portion right now"; the second-most-common is "I'm having a leftover
portion" — both deserve one click.

## What Changes

1. **Cook dialog: "Eating now" portions.** A number input (0 to the
   cooked portion count, default 1). On confirm, after the batch is
   created and the pantry consumed, N > 0 logs a meal (batch-portion
   line, eaten at now) against the fresh batch. A meal-log failure after
   the batch/pantry succeeded is a WARNING in the result, never a
   rollback — cooking happened; only the eat-record is missing.
2. **Batch rows: "Log 1 portion".** Each Meals › Batches row with ≥1
   remaining portion gets a button that logs one portion eaten now and
   refreshes the row's remaining count.

## Impact

- `cook.schema` + `cook-actions` (+ eat-now), `CookRecipeDialog`,
  `meal-log-actions` (+ quickLogBatchPortion), batches page + new button
  component, tests. Planner-only; the service's meal API is unchanged.
