## ADDED Requirements

### Requirement: List columns sort on click
The pantry (Name / Quantity / Stocked), products (Name / Calories /
Category), and Inventory ready-to-consume (Name / Portions) lists SHALL
offer clickable column titles: first click sorts ascending, a second
click flips direction, the active column shows a direction indicator
and aria-sort, and strings compare case-insensitively with null values
last.

#### Scenario: Sort the pantry by quantity
- **WHEN** the user clicks the pantry's Quantity title twice
- **THEN** rows order by quantity ascending, then descending
