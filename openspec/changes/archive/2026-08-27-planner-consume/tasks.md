# Tasks: planner-consume

- [x] 1. Migration 0018 `consumedAt` + schema/repo plumbing (record, row,
      markConsumed, listUnconsumedBatchPlans, ingredientCategory join,
      backup export field)
- [x] 2. domain: defaultPortionQuantity (COUNT→1 each, package, else
      100 g/100 mL) + unit tests
- [x] 3. Extract pantry consumption core (service mirror + meal + pantry
      decrement) shared by eatPantryItem and consumePlanEntry
- [x] 4. consumePlanEntry server action (validation, FIFO batch
      allocation, backdated eatenAt, markConsumed) + integration tests
- [x] 5. Availability math: all-dates unconsumed planned portions;
      plannedPortions on readyToEat rows; getPlannedPortionsByBatch facade
- [x] 6. UI: PlanDayColumn Eat/Drink + consumed badge (no ✕ once
      consumed); picker + Ready-to-eat planned counts; Batches page
      planned badge
- [x] 7. Mobile route POST /api/mobile/planner-entries/consume + openapi +
      insomnia regen
- [x] 8. e2e (service-gated, chromium): plan yesterday → Eat → consumed
      badge, availability restored on remove
- [x] 9. Docs: CLAUDE.md state/log; delta specs synced on archive
