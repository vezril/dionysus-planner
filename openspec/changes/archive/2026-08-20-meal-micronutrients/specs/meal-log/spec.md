## ADDED Requirements

### Requirement: Cook mirrors carry micronutrients to the meal service
When the cook flow creates a service ingredient mirror, it SHALL include
the planner ingredient's micronutrients converted to per-canonical-unit
amounts (amount ÷ reference quantity), so service-side recipe, meal, and
day-log rollups include them. Existing mirrors are not retro-updated
(reuse-by-name semantics unchanged).

#### Scenario: Cooking a vitamin-bearing recipe
- **WHEN** a recipe line's ingredient carries vitamin C 16.9014 mg per 100 mL and the mirror is first created
- **THEN** the service ingredient is created with micronutrients vitamin C ≈0.169014 per mL

### Requirement: The Meals day view shows micronutrient totals
The Meals day page SHALL render a Micronutrients list when the day's
total nutrition includes micronutrient keys — registry label and unit
where known, the raw key otherwise — and SHALL render nothing extra when
the map is empty or absent.

#### Scenario: Supplement day
- **WHEN** the day log's totals include `{"vitaminD": 25}`
- **THEN** the day view lists "Vitamin D 25 µg"

#### Scenario: No micronutrients, unchanged page
- **WHEN** the day's totals have no micronutrient keys
- **THEN** the page renders exactly as before this change
