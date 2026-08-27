# Delta: weekly-planner (planner-consume)

## ADDED Requirements

### Requirement: Planned entries are consumable on their own day

eat_batch and eat_pantry plan entries SHALL carry a nullable `consumedAt`
timestamp. A per-entry Eat/Drink control (Drink when the pantry product's
category is DRINK) SHALL log the meal to the inventory service with
`eatenAt` on the ENTRY's date (now when the date is today, noon UTC when
backdated), then set `consumedAt` — service-first, all-or-nothing.
Entries dated in the future SHALL be refused. Consumed entries SHALL
render an eaten/drunk badge and SHALL offer neither the consume nor the
remove control (there is no service-side un-log).

#### Scenario: Eat a batch entry planned on a past day

- **GIVEN** an unconsumed eat_batch entry dated yesterday
- **WHEN** its Eat button is pressed
- **THEN** the service meal is logged with eatenAt at noon UTC of that
  date, portions drain the recipe's batches oldest-first (spanning
  batches when the snapshotted one is short), and the entry shows the
  eaten badge in place of its buttons

#### Scenario: Consume a planned pantry drink

- **GIVEN** an unconsumed eat_pantry entry for a DRINK product
- **WHEN** its Drink button is pressed
- **THEN** one portion per planned portion is consumed from the pantry
  (COUNT → 1 each; else the package size; else the 100 g/100 mL
  reference), the service meal lands on the entry's date, and the entry
  is marked consumed

#### Scenario: Insufficient batch portions

- **WHEN** consuming an eat_batch entry whose recipe has fewer remaining
  portions than planned
- **THEN** the action fails with a message and nothing is logged,
  consumed, or marked

### Requirement: Planning reserves, consumption decrements

Creating a plan entry SHALL NOT decrement pantry stock or service batch
portions. Batch availability shown anywhere SHALL be the service's
remaining portions minus ALL unconsumed eat_batch plan portions
regardless of date. Planned (unconsumed) portion counts SHALL be visible
in the planner add picker, the Ready-to-eat list, and the Batches admin
page. Removing an unconsumed entry SHALL free its reservation (the
availability figure returns) with no service call.

#### Scenario: Planned portions visible and reserved across weeks

- **GIVEN** a batch with 4 remaining portions and an unconsumed
  eat_batch entry for 1 portion planned NEXT week
- **WHEN** the planner or Batches page renders this week
- **THEN** availability shows 3 with a planned count of 1

#### Scenario: Removing an unconsumed entry frees the reservation

- **GIVEN** the state above
- **WHEN** the entry is removed
- **THEN** availability returns to 4 and no inventory call is made

#### Scenario: Consumed entries stop reserving

- **GIVEN** an eat_batch entry that has been consumed
- **THEN** its portions are no longer subtracted from availability (the
  service's remaining-portions figure already reflects them)
