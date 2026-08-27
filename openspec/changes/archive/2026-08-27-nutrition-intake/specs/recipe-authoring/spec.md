# Delta: recipe-authoring (nutrition-intake)

## ADDED Requirements

### Requirement: Live nutrition preview while building a recipe

The recipe editor SHALL show a debounced per-serving nutrition preview
computed from the typed body (same cooklang parse + nutrition math as a
saved recipe), each nutrient annotated with its percent of the resolved
daily target where one exists. Parse errors or a body with no complete
mentions SHALL simply render no preview — never an error state that
interrupts typing. Nutrients whose data is incomplete across the
mentioned products render an em dash, never a fabricated 0.

#### Scenario: Preview reflects the typed mentions

- **GIVEN** a 2500 kcal daily calorie target and a 4-serving body whose
  mentions total 1000 kcal
- **WHEN** the author pauses typing
- **THEN** the preview shows 250 kcal per serving annotated "10%"
