## ADDED Requirements

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
