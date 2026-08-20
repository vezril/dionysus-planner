## ADDED Requirements

### Requirement: The week's shopping list aggregates plan shortfalls
The planner SHALL show, for the displayed week, a shopping list computed
by simulating the planned entries in order against the pantry: for each
ingredient, the summed quantity the pantry cannot cover — shortfalls in
the pantry row's unit basis, wholly-missing ingredients in their
canonical unit — plus a named note for lines whose units cannot be
resolved. A covered (or empty) week SHALL state there is nothing to buy.
A copy control SHALL put a plain-text list on the clipboard.

#### Scenario: Two smoothies, one carton
- **WHEN** the pantry holds 400 mL of juice and the week plans two 300 mL smoothies
- **THEN** the shopping list shows the juice at 200 mL

#### Scenario: Entirely missing ingredient
- **WHEN** a planned recipe uses an ingredient with no pantry row at 250 g per cook
- **THEN** the list shows that ingredient at 250 g

#### Scenario: Nothing to buy
- **WHEN** the pantry covers every planned entry
- **THEN** the section states there is nothing to buy
