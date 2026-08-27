# weekly-planner

## Requirements

### Requirement: A week of planned meals
`/planner` SHALL show a Monday–Sunday week (defaulting to the current
week in the configured timezone, navigable by week) where each day lists
planned entries — a recipe at a portion count — with add and remove
controls. Entries persist; deleting a recipe removes its plan entries.

#### Scenario: Plan Tuesday's dinner
- **WHEN** the user adds "Chili" at 4 portions to Tuesday
- **THEN** Tuesday lists "Chili · 4 portions" and it survives a reload

#### Scenario: Week navigation
- **WHEN** the user navigates to next week
- **THEN** the grid shows those seven days and their own entries

### Requirement: Suggestions deplete the pantry by the planned week
The suggestion panel SHALL rank recipes by cookability computed against
the pantry AFTER simulating consumption of every entry in the displayed
week (scaled by portions, resolved via the existing unit machinery;
unresolvable lines deduct nothing, floors at zero). Cookable recipes
list first, then near-matches; each suggestion offers one-click add to a
chosen day.

#### Scenario: Planning consumes headroom
- **WHEN** the pantry holds enough for one batch of "Chili" and it is planned on Monday
- **THEN** "Chili" no longer appears as cookable in the suggestions for that week

### Requirement: Expiring items steer suggestions
A suggestion whose recipe uses at least one pantry item currently
expiring or expired SHALL carry a visible "uses expiring" indicator and
sort above other suggestions of the same cookability tier.

#### Scenario: Use the milk first
- **WHEN** milk is 2 days from its shelf-life estimate and a cookable recipe uses it
- **THEN** that recipe appears at the top of the cookable suggestions with the indicator

### Requirement: The week's shopping list aggregates plan shortfalls
The planner SHALL show, for the displayed week, a shopping list computed
by simulating the planned entries in order against the pantry: for each
ingredient, the summed quantity the pantry cannot cover — shortfalls in
the pantry row's unit basis, wholly-missing ingredients in their
canonical unit — plus a named note for lines whose units cannot be
resolved. A covered (or empty) week SHALL state there is nothing to buy.
A copy control SHALL put a plain-text list on the clipboard.

#### Scenario: Two smoothies, one carton
- **WHEN** the pantry holds 400 mL of juice and the week plans two 300 mL smoothies
- **THEN** the shopping list shows the juice at 200 mL

#### Scenario: Entirely missing ingredient
- **WHEN** a planned recipe uses an ingredient with no pantry row at 250 g per cook
- **THEN** the list shows that ingredient at 250 g

#### Scenario: Nothing to buy
- **WHEN** the pantry covers every planned entry
- **THEN** the section states there is nothing to buy

### Requirement: Batch entries plan ready-to-eat meals alongside cooking
Plan entries SHALL be either a recipe to cook or a service batch to eat
(portions, batch label snapshotted at plan time). The add form SHALL
offer both; day cells render batch entries distinctly. Batch entries
SHALL NOT affect pantry depletion, cookability suggestions, or the
shopping list.

#### Scenario: Leftover Wednesday
- **WHEN** the user plans 2 portions of the "Chili" batch on Wednesday
- **THEN** Wednesday shows "Chili (batch) · 2 portions" and the shopping list is unchanged

### Requirement: Ready-to-eat availability reflects the week's plan
The planner SHALL list batches with remaining portions, reduced by the
displayed week's planned batch entries, leading the suggestions. A batch
fully planned for the week SHALL not be offered further. When the meal
service is unreachable the planner SHALL still render with cook planning
intact and an empty ready-to-eat group.

#### Scenario: Portions are finite
- **WHEN** a batch has 4 remaining and 3 are planned this week
- **THEN** the ready-to-eat group offers it at 1 portion

#### Scenario: Service down
- **WHEN** the meal service is unreachable
- **THEN** the planner renders with recipes, suggestions, and shopping list; the ready-to-eat group is empty

### Requirement: The calendar itself selects the target day
Clicking a day card SHALL make it the add form's target day, visibly
highlighted; the form shows the selected day and offers no separate day
picker. The selection defaults to today when the displayed week contains
it and to the week's Monday otherwise.

#### Scenario: Plan onto Wednesday by clicking it
- **WHEN** the user clicks Wednesday's card and adds a recipe
- **THEN** the entry appears under Wednesday

### Requirement: Plan entries show their calories
Each plan entry SHALL show its total calories for the planned portions
(per-serving × portions, rounded) — from the recipe's nutrition for cook
entries and the service recipe's nutrition for batch entries. When the
value cannot be computed (incomplete nutrition, unreachable service) the
entry renders without a number, never a fake zero.

#### Scenario: Batch entry with calories
- **WHEN** 2 portions of a batch whose per-serving is 100 kcal are planned
- **THEN** the entry reads like "Test (batch) · 2 portions · 200 kcal"

### Requirement: Ready-to-eat pantry products are plannable
The planner picker SHALL offer stocked ready-to-eat pantry products
("— from pantry"); adding one creates an eat_pantry entry on the chosen
day (name snapshotted, ingredientId recorded, nothing consumed until
actually eaten), rendered with a "(from pantry)" badge and removable
like any entry. Non-ready-to-eat products are rejected.

#### Scenario: Plan a beer for Friday
- **WHEN** the user picks a stocked ready-to-eat beer from the picker for Friday
- **THEN** Friday shows the beer with a "(from pantry)" badge and the pantry is unchanged

### Requirement: Immediate consumption lands on the plan
Cooking with "Eating now" portions and the Inventory one-tap portion
log SHALL each record an eat_item plan entry on today for the consumed
portions, so all immediate consumption is accounted in the plan.

#### Scenario: Cook and eat two now
- **WHEN** the user cooks 4 portions eating 2 now
- **THEN** today's plan shows the recipe marked eaten for 2 portions

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
