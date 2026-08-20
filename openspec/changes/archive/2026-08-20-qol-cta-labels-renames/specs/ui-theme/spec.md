## MODIFIED Requirements

### Requirement: Sidebar order follows the data flow, Meals by name
The sidebar SHALL list, in order: What Can I Cook, Products, Pantry,
Recipes, Inventory. The catalog section SHALL be labeled "Products" (its
routes remain under `/ingredients`) and the consumption section
"Inventory" (its routes remain under `/meal-log`); nav labels and the
destination h1 headings match.

#### Scenario: Order and labels
- **WHEN** any page renders
- **THEN** the sidebar links appear in the order What Can I Cook, Products, Pantry, Recipes, Inventory, with `/ingredients` labeled "Products" and `/meal-log` labeled "Inventory"

#### Scenario: Nav label still equals the destination heading
- **WHEN** the user follows the "Products" or "Inventory" link
- **THEN** the destination h1 reads "Products" / "Inventory"
