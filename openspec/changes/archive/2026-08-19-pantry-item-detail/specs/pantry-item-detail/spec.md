## ADDED Requirements

### Requirement: Pantry rows link to a detail page
Each row on `/pantry` SHALL link to `/pantry/{id}` for that pantry item. An unknown id SHALL render the not-found boundary, not an error.

#### Scenario: Clicking a pantry item opens its detail page
- **WHEN** the user clicks a pantry item's name in the pantry list
- **THEN** the browser navigates to that item's detail page, headed by the ingredient's name

#### Scenario: Unknown pantry item id
- **WHEN** the user requests `/pantry/999999` where no such pantry item exists
- **THEN** the not-found page renders

### Requirement: The detail page shows the ingredient's nutrition facts
The detail page SHALL display the linked ingredient's nutrition per reference unit: calories, protein, carbs, and fat always; fiber, sugar, and sodium when present on the ingredient (they are optional fields, A-1).

#### Scenario: Nutrition facts render
- **WHEN** the detail page loads for an item whose ingredient has calories 40, protein 1.1, carbs 9, fat 0.1 and sodium 4
- **THEN** all five values are visible, and absent optional fields (e.g. fiber) are omitted or shown as not recorded — never as 0

### Requirement: The detail page shows on-hand quantity
The detail page SHALL display the pantry item's current on-hand quantity in its display units (verbatim `displayQuantity` + `displayUnit`, FR-9).

#### Scenario: On-hand quantity renders
- **WHEN** the detail page loads for an item holding 500 g
- **THEN** "500 g" (display quantity and unit) is visible

### Requirement: Purchases can be logged against the item's ingredient
The detail page SHALL provide a form to log a purchase: price (required, non-negative), store (optional), purchased quantity and unit (optional, stored verbatim), and purchase date (`YYYY-MM-DD`, defaulting to today). Purchases are keyed by the ingredient, not the pantry row.

#### Scenario: Logging a purchase with only a price
- **WHEN** the user submits the purchase form with price 4.99 and no other fields
- **THEN** the purchase is saved and appears in the history with its date

#### Scenario: Logging a purchase with store and quantity
- **WHEN** the user submits price 8.49, store "Metro", quantity 1 kg
- **THEN** the purchase appears in the history showing all captured fields

#### Scenario: Price is required and non-negative
- **WHEN** the user submits the form without a price, or with a negative price
- **THEN** a validation error is shown and nothing is saved

### Requirement: Purchase history is listed and survives pantry churn
The detail page SHALL list the ingredient's purchases, most recent first. Removing and re-adding the pantry item SHALL NOT lose purchase history (purchases live on the ingredient).

#### Scenario: History persists across pantry item removal
- **WHEN** a purchase is logged, the pantry item is removed, and the same ingredient is added to the pantry again
- **THEN** the new pantry item's detail page still lists the earlier purchase

### Requirement: A purchase can be deleted
The system SHALL allow deleting a purchase (typo correction). Purchases are not editable.

#### Scenario: Deleting a purchase
- **WHEN** the user deletes a purchase from the history
- **THEN** it disappears from the list and from the derived stats

### Requirement: Derived price stats are computed, never stored
When at least one purchase exists, the detail page SHALL show the most recent price paid and the lowest recorded price (with its store, when recorded). These SHALL be derived from the purchase list at read time.

#### Scenario: Stats reflect the history
- **WHEN** purchases of 5.99 (2026-08-01, "Metro") and 4.49 (2026-08-15, "Maxi") exist
- **THEN** the page shows last paid 4.49 and lowest 4.49 at "Maxi"

#### Scenario: No purchases yet
- **WHEN** no purchases exist for the ingredient
- **THEN** the stats area shows an empty state instead of zeros
