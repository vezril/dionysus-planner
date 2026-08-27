# Delta: weekly-planner (nutrition-intake)

## ADDED Requirements

### Requirement: Day cards show the day's share of the calorie budget

Each planner day card SHALL total its entries' calories and show the sum
with its percent of the daily calorie target, colored by the cap fit
(ok / near / over). eat_pantry entries SHALL contribute calories sized
by the portion ladder (1 each / package / 100 g·mL reference), and
eat_item entries backed by a batch SHALL contribute the batch recipe's
per-serving calories; entries whose calories are unknowable stay out of
the sum without blocking the chip.

#### Scenario: A day half-way to budget

- **GIVEN** a 2500 kcal target and a day whose entries total 1250 kcal
- **THEN** the day card shows "1250 kcal · 50%" in the ok tone
