## ADDED Requirements

### Requirement: Ingredients can carry product identity
An ingredient SHALL optionally carry `brand`, `barcode`, and package size (`packageQuantity` + `packageUnit`). A non-empty `barcode` SHALL be unique across ingredients; ingredients without a barcode are unlimited.

#### Scenario: Creating a product with a barcode
- **WHEN** a custom item is created with barcode "064100128866"
- **THEN** the ingredient stores it, and a second item with the same barcode is rejected with a field error naming the conflict

#### Scenario: Products without barcodes coexist
- **WHEN** two custom items are created with no barcode
- **THEN** both save successfully

### Requirement: A custom pantry item is created in one step from the pantry page
`/pantry` SHALL offer a "Create custom item" control opening a form with: name, unit class, full nutrition (same fields and reference-quantity basis as the ingredient form), optional product identity (brand, barcode, package size), and an initial on-hand quantity (zero allowed) with unit. Submitting SHALL create the CUSTOM ingredient and its pantry row atomically — never one without the other.

#### Scenario: Creating "Ritz crackers" from the pantry
- **WHEN** the user creates a custom item named "Ritz crackers" with nutrition, a barcode, and initial quantity 200 g
- **THEN** one new ingredient (source CUSTOM) and one pantry row exist, and the pantry list shows the item immediately

#### Scenario: Creating a custom item with zero initial quantity
- **WHEN** the user creates a custom item with initial quantity 0
- **THEN** the item appears in the pantry list in its out-of-stock state

#### Scenario: Validation failure creates nothing
- **WHEN** the form is submitted with a missing required field (e.g. no name)
- **THEN** a field error is shown and neither an ingredient nor a pantry row is created

### Requirement: Zero-quantity pantry rows persist
A pantry row SHALL accept quantity zero on creation and on edit, SHALL remain listed at zero, and SHALL render a visible out-of-stock indication instead of a quantity. Only the explicit Remove control deletes a row. (MODIFIES the S-304-era `quantity > 0` rule, which predates the openspec specs.)

#### Scenario: Editing an item down to zero
- **WHEN** the user edits an existing pantry item's quantity to 0
- **THEN** the row stays in the list showing out-of-stock, and its detail page still opens

#### Scenario: Restocking a zero row
- **WHEN** the user edits a zero-quantity row to 350 g
- **THEN** the row shows "350 g" again with no out-of-stock indication

#### Scenario: Zero stock never satisfies a recipe
- **WHEN** a recipe requires an ingredient whose pantry row is at zero
- **THEN** cookability treats it exactly as insufficient stock (unchanged matcher behavior)

## MODIFIED Requirements

### Requirement: The detail page shows product identity when present
The `/pantry/{id}` detail page (capability `pantry-item-detail`) SHALL additionally display a product panel — brand, barcode, and package size — when the ingredient has at least one of them; ingredients with none render exactly as before.

#### Scenario: Product panel renders for a branded item
- **WHEN** the detail page loads for an item whose ingredient has brand "Ritz" and a barcode
- **THEN** both are visible in a product section

#### Scenario: No product panel for generic ingredients
- **WHEN** the detail page loads for an ingredient with no product fields
- **THEN** no product section renders
