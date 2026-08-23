## ADDED Requirements

### Requirement: Month and year views carry averages, trends, and charts
Month and year views SHALL show per-logged-day averages (calories,
protein, meals, alcohol units/week) with a percent delta against the
previous period, plus bar charts of calories (per day / per month) and
alcohol units (per week / per month) with dashed average lines and, on
the month view, dashed target lines. Empty days render as gaps; the
breakdown table remains.

#### Scenario: Exploring a month
- **WHEN** the user opens the month view with logged meals
- **THEN** KPI averages with deltas, a daily calories chart with the daily cap line, and a weekly alcohol chart with the weekly cap line render above the table
