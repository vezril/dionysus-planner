## ADDED Requirements

### Requirement: The recipe list always offers creation
`/recipes` SHALL render a "New recipe" link to `/recipes/new` in its
header regardless of how many recipes exist (the empty state keeps its
call-to-action too).

#### Scenario: Populated list
- **WHEN** recipes exist
- **THEN** the header shows a "New recipe" link to `/recipes/new`

### Requirement: Nutrition inputs state their unit
Every nutrition entry input SHALL carry its unit in the visible label —
Calories (kcal); Protein, Carbs, Fat, Fiber, Sugar, Alcohol (g); Sodium
(mg); Density (g/mL) — on the product form and the custom-item dialog.

#### Scenario: No unit ambiguity
- **WHEN** the user reaches the Sodium input on either form
- **THEN** its label reads "Sodium (mg)"
