# Plan pantry items + backdated quick-consume

## Why
The planner can't plan ready-to-eat pantry products (only recipes and
batches), and Eat/Drink Now always logs to today — forgotten items
can't be accounted to the day they were actually consumed.

## What Changes
- Migration 0016: plan_entry.ingredientId. New entry kind eat_pantry —
  a ready-to-eat pantry product planned onto a day (label snapshotted,
  nothing consumed until actually eaten). Planner picker gains a
  "— from pantry" group; entries render with a "(from pantry)" badge;
  eat_item entries now also record their ingredientId.
- eatPantryItem accepts an optional date (past or today, never future):
  the service meal lands at noon UTC of that day and the eat_item plan
  entry goes to that date. The Eat/Drink dialog gets a "Log to day"
  date input (max today) with a backdating hint.

## Impact
schema/migration 0016, plannerRepo, planEntry schema, planner action +
week payload (pantryOptions), AddPlanEntryForm/Board/DayColumn,
eat-actions + EatItemButton, tests, train v2.34.0.
