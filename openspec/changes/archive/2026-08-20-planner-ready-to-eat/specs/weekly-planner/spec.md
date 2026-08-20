## ADDED Requirements

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
