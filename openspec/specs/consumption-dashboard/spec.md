# consumption-dashboard

## Requirements

### Requirement: Consumption is viewable by day, week, month, and year
`/dashboard` SHALL show, for a selectable period (day / week / month /
year, navigable backward and forward), the period's consumption from the
meal service's day logs: total calories, protein, carbs, fat, sodium,
meal count, and alcohol units, plus a per-day (day/week/month) or
per-month (year) breakdown of calories, meals, and alcohol units. An
unreachable service SHALL yield a clear message, never fabricated data.

#### Scenario: A week at a glance
- **WHEN** meals exist on three days of the selected week
- **THEN** the totals sum those days and the breakdown lists exactly those three days

### Requirement: Alcohol counts in CRDM standard units
Alcohol SHALL be displayed as CRDM units — millilitres of ethanol
divided by 17 (grams ÷ 0.789 ÷ 17), rounded to two decimals — wherever
the dashboard reports it. Cook mirrors SHALL forward ingredient alcohol
grams into service day logs via the micronutrient map so the units are
computable.

#### Scenario: One can of beer
- **WHEN** a day's log carries 14.005 g of alcohol (a 355 mL 5% beer)
- **THEN** the dashboard shows 1.04 units for that day
