## ADDED Requirements

### Requirement: Sidebar order follows the data flow, Meals by name
The sidebar SHALL list, in order: What Can I Cook, Ingredients, Pantry,
Recipes, Meals. The meal section SHALL be labeled "Meals" (nav label and
its pages' h1 headings alike); its routes remain under `/meal-log`.

#### Scenario: Order and labels
- **WHEN** any page renders
- **THEN** the sidebar links appear in the order What Can I Cook, Ingredients, Pantry, Recipes, Meals, and the link to `/meal-log` reads "Meals"

#### Scenario: Nav label still equals the destination heading
- **WHEN** the user follows the "Meals" link
- **THEN** the destination h1 reads "Meals"
