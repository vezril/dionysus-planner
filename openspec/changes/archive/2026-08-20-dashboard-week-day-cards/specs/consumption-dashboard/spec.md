## ADDED Requirements

### Requirement: Week view shows clickable per-day summary cards
On the week period the dashboard SHALL show one card per calendar date
of the week (unlogged days included) summarizing that day — meals,
calories, protein, carbs, fat, alcohol units — with day-level fit
coloring, and each card SHALL link to the dashboard day view for that
date.

#### Scenario: Drill into a day
- **WHEN** the user clicks a day card in the week view
- **THEN** the dashboard opens `period=day` anchored to that date
