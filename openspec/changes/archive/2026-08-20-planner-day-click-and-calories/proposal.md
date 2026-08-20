# Proposal: planner-day-click-and-calories

## Why

Two friction points from daily planner use: picking the day through a
dropdown when the calendar is right there, and planned entries hiding
their caloric weight.

## What Changes

1. **Click a day to target it**: the add form loses its Day dropdown;
   clicking a day card selects it (highlighted, "Adding to" label in the
   form), defaulting to today when the displayed week contains it,
   Monday otherwise.
2. **Per-entry calories**: every plan entry shows its total calories for
   the planned portions — cook entries via the recipe's per-serving
   nutrition, batch entries via the service recipe's per-serving values.
   Incomplete nutrition or an unreachable service omits the number
   rather than faking one.

## Impact

A client `PlannerBoard` wrapper owning the selected-day state; facade
computes `caloriesKcal` per entry. No schema changes.
