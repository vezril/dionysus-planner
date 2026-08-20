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
