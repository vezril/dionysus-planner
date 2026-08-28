# Delta: weekly-planner (recipe-links-precision)

## ADDED Requirements

### Requirement: Day-card entry controls stay inside the card

A planner day card SHALL contain its entry controls at every
breakpoint, including the 7-column desktop layout where a card is
roughly 130px wide. The entry's meta line (portions · kcal) SHALL
truncate rather than push the Eat/Drink and remove buttons out of the
card, and the button pair SHALL stay together on one line.

#### Scenario: A long entry label at the 7-column breakpoint

- **GIVEN** an unconsumed batch entry with portions and a calorie total
- **WHEN** the week grid renders at desktop width
- **THEN** the day card shows both buttons within its own bounds and
  the page has no horizontal overflow
