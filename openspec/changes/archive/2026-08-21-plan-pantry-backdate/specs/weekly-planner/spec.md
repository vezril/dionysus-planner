## ADDED Requirements

### Requirement: Ready-to-eat pantry products are plannable
The planner picker SHALL offer stocked ready-to-eat pantry products
("— from pantry"); adding one creates an eat_pantry entry on the chosen
day (name snapshotted, ingredientId recorded, nothing consumed until
actually eaten), rendered with a "(from pantry)" badge and removable
like any entry. Non-ready-to-eat products are rejected.

#### Scenario: Plan a beer for Friday
- **WHEN** the user picks a stocked ready-to-eat beer from the picker for Friday
- **THEN** Friday shows the beer with a "(from pantry)" badge and the pantry is unchanged
